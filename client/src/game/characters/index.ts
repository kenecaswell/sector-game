// The characters' art: the Farmer, Scientist, Explorer, Engineer and Robot, each drawn in eight
// directions with whatever upgrade they have on, using vector drawing (no image files). The drawing
// is plain math over a `Brush`, kept apart from Phaser so the specs and tools/character-sheet.js can
// run it (see rig.ts for how a character is posed and structures/canvas.ts for the projection).
//
// `angle` is the way the character faces, as the game measures it: 0 = right (E), PI/2 = toward
// the viewer (S), so N shows the back and S shows the face.

import type Phaser from 'phaser';
import {
    activeUpgradeLevel,
    isCharacterId,
    DEFAULT_CHARACTER,
    type CharacterId,
    type UpgradeHolder,
    type UpgradeId,
} from '../../types/shared';
import { Canvas3D, type Brush } from '../structures/canvas';
import { Rig } from './rig';
import { drawArmor, drawBooster, drawHarvester, drawJetpack, JETPACK_LIFT } from './upgrades';
import {
    ANCHORS,
    drawEngineer,
    drawExplorer,
    drawFarmer,
    drawRobot,
    drawScientist,
    type Cast,
} from './suits';
import { STANDING, strideFrame, type Stride } from './gait';

export { JETPACK_LIFT };
export * from './gait';

/** The eight facings, in sheet order (clockwise from the back): angle is in radians. */
export const DIRECTIONS = [
    { name: 'N', angle: -Math.PI / 2 },
    { name: 'NE', angle: -Math.PI / 4 },
    { name: 'E', angle: 0 },
    { name: 'SE', angle: Math.PI / 4 },
    { name: 'S', angle: Math.PI / 2 },
    { name: 'SW', angle: (3 * Math.PI) / 4 },
    { name: 'W', angle: Math.PI },
    { name: 'NW', angle: (-3 * Math.PI) / 4 },
] as const;

export type DirectionName = (typeof DIRECTIONS)[number]['name'];

/** The facing closest to `angle` (radians, any range). */
export function nearestDirection(angle: number): number {
    const step = Math.PI / 4;
    const turns = Math.round((angle - DIRECTIONS[0].angle) / step);
    return ((turns % 8) + 8) % 8;
}

/** A body frame: the trunk, head, arms and what they carry (and the Jetpack's flames). */
export const CHARACTER_FRAME = { width: 96, height: 96, originX: 48, originY: 78 };

/** A legs frame: the hips down, with the shadow. Smaller, since there are many more of them. */
export const LEGS_FRAME = { width: 64, height: 64, originX: 32, originY: 44 };

/** Which slot upgrade is on and its level, plus Armor's level (which is always on). */
export interface CharacterLoadout {
    equipped?: Exclude<UpgradeId, 'armor'> | '';
    /** The equipped slot upgrade's level (1 to its max). */
    level?: number;
    armor?: number;
    /** The team's color (0xRRGGBB) for the suit; the character's own colors if left out. */
    team?: number;
}

const BODIES: Record<CharacterId, (cast: Cast) => void> = {
    farmer: drawFarmer,
    scientist: drawScientist,
    explorer: drawExplorer,
    engineer: drawEngineer,
    robot: drawRobot,
};

type Layer = 'legs' | 'body' | 'both';

/** How the legs are turned and where they are in a stride, if not standing facing the way they aim. */
export interface Gait {
    legAngle?: number;
    stride?: Stride;
}

function render(
    g: Brush,
    ox: number,
    oy: number,
    id: CharacterId,
    aimAngle: number,
    loadout: CharacterLoadout,
    layer: Layer,
    shadow: boolean,
    gait: Gait
): void {
    const equipped = loadout.equipped || '';
    const level = Math.max(1, loadout.level ?? 1);
    const anchors = ANCHORS[id];
    const canvas = new Canvas3D(g, ox, oy);
    const lift = equipped === 'wings' ? JETPACK_LIFT : 0;
    // Both layers are built in the same pass over the same character; each rig draws only its own.
    const lo = new Rig(canvas, gait.legAngle ?? aimAngle, lift, layer === 'body');
    const up = new Rig(canvas, aimAngle, lift, layer === 'legs');

    if (shadow) lo.shadow(id === 'robot' ? 17 : 13);
    BODIES[id]({
        lo,
        up,
        stride: equipped === 'wings' ? STANDING : (gait.stride ?? STANDING),
        team: loadout.team,
        shins: (loadout.armor ?? 0) >= 3,
    });
    if (equipped === 'booster') drawBooster(up, anchors, level);
    if (equipped === 'expander') drawHarvester(up, anchors, level);
    if (equipped === 'wings') drawJetpack(up, anchors);
    if ((loadout.armor ?? 0) > 0) drawArmor(up, anchors, loadout.armor ?? 0);
    lo.flush();
    up.flush();
}

/**
 * Draws a whole character with its feet at (ox, oy) in `g`, its body facing `angle`; its legs face
 * `gait.legAngle` (the same, standing, if left out) at `gait.stride`. A Jetpack lifts it off the
 * ground and its shadow stays down. `shadow: false` leaves the shadow out.
 */
export function drawCharacter(
    g: Brush,
    ox: number,
    oy: number,
    id: CharacterId,
    angle: number,
    loadout: CharacterLoadout = {},
    shadow = true,
    gait: Gait = {}
): void {
    render(g, ox, oy, id, angle, loadout, 'both', shadow, gait);
}

/** Only the legs (hips down) and the shadow: the layer that follows the way it is walking. */
export function drawLegs(
    g: Brush,
    ox: number,
    oy: number,
    id: CharacterId,
    legAngle: number,
    loadout: CharacterLoadout = {},
    stride: Stride = STANDING,
    shadow = true
): void {
    render(g, ox, oy, id, legAngle, loadout, 'legs', shadow, { stride });
}

/** Only the body (trunk, head, arms, pack, tools, upgrades): the layer that follows the aim. */
export function drawBody(
    g: Brush,
    ox: number,
    oy: number,
    id: CharacterId,
    aimAngle: number,
    loadout: CharacterLoadout = {}
): void {
    render(g, ox, oy, id, aimAngle, loadout, 'body', false, {});
}

/** The upgrades a player shows: their equipped slot upgrade (if they own it) and their Armor. */
export function loadoutOf(player: UpgradeHolder): CharacterLoadout {
    for (const id of ['booster', 'expander', 'wings'] as const) {
        const level = activeUpgradeLevel(player, id);
        if (level > 0) return { equipped: id, level, armor: player.armorLevel };
    }
    return { equipped: '', level: 1, armor: player.armorLevel };
}

/** A character id from state (which is just a string), falling back to the default one. */
export function characterIdOf(character: string): CharacterId {
    return isCharacterId(character) ? character : DEFAULT_CHARACTER;
}

/**
 * The texture key for a body frame: who, which of the eight facings, what they have on and the team
 * color they wear.
 */
export function bodyTextureKey(
    id: CharacterId,
    direction: number,
    loadout: CharacterLoadout = {}
): string {
    const slot = loadout.equipped ? `${loadout.equipped}${loadout.level ?? 1}` : 'none';
    const team = loadout.team === undefined ? 'own' : loadout.team.toString(16);
    return `body-${id}-${direction}-${slot}-armor${loadout.armor ?? 0}-${team}`;
}

/** Only the Jetpack (the legs hang), Armor 3 (shin guards) and the team color change the legs. */
function legsLook(loadout: CharacterLoadout) {
    return {
        hover: loadout.equipped === 'wings',
        shins: (loadout.armor ?? 0) >= 3,
        team: loadout.team,
    };
}

/**
 * The texture key for a legs frame: who, which of the eight facings, which frame of the walk
 * (STRIDE_FRAMES of them; -1 standing; always -1 under a Jetpack) and what changes the legs.
 */
export function legsTextureKey(
    id: CharacterId,
    direction: number,
    frame: number,
    loadout: CharacterLoadout = {}
): string {
    const look = legsLook(loadout);
    const team = look.team === undefined ? 'own' : look.team.toString(16);
    const f = look.hover ? -1 : frame;
    return `legs-${id}-${direction}-${f}-${look.hover ? 'hover' : 'ground'}${look.shins ? '-shins' : ''}-${team}`;
}

/**
 * Draws a body frame into a texture (once per key) and returns its key: the character facing
 * `DIRECTIONS[direction]` from the waist up, feet at CHARACTER_FRAME's origin. A frame is baked the
 * first time it's wanted, so a match only ever pays for the looks that actually appear.
 */
export function bakeBody(
    scene: Phaser.Scene,
    id: CharacterId,
    direction: number,
    loadout: CharacterLoadout = {}
): string {
    const key = bodyTextureKey(id, direction, loadout);
    if (scene.textures.exists(key)) return key;
    const { width, height, originX, originY } = CHARACTER_FRAME;
    const g = scene.make.graphics({}, false);
    drawBody(g, originX, originY, id, DIRECTIONS[direction].angle, loadout);
    g.generateTexture(key, width, height);
    g.destroy();
    return key;
}

/** Draws a legs frame into a texture (once per key) and returns its key; origin is LEGS_FRAME's. */
export function bakeLegs(
    scene: Phaser.Scene,
    id: CharacterId,
    direction: number,
    frame: number,
    loadout: CharacterLoadout = {}
): string {
    const key = legsTextureKey(id, direction, frame, loadout);
    if (scene.textures.exists(key)) return key;
    const { width, height, originX, originY } = LEGS_FRAME;
    const g = scene.make.graphics({}, false);
    const hover = loadout.equipped === 'wings';
    const stride = hover || frame < 0 ? STANDING : strideFrame(frame);
    drawLegs(g, originX, originY, id, DIRECTIONS[direction].angle, loadout, stride);
    g.generateTexture(key, width, height);
    g.destroy();
    return key;
}
