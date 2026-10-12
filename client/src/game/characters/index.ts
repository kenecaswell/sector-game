// The characters' art: the Farmer, Scientist, Explorer, Engineer and Robot, each drawn in eight
// directions with whatever upgrade they have on, using vector drawing (no image files). The drawing
// is plain math over a `Brush`, kept apart from Phaser so the specs and tools/character-sheet.js can
// run it (see rig.ts for how a character is posed and structures/canvas.ts for the projection).
//
// `angle` is the way the character faces, as the game measures it: 0 = right (E), PI/2 = toward
// the viewer (S), so N shows the back and S shows the face.

import type { CharacterId, UpgradeId } from '../../types/shared';
import { Canvas3D, type Brush } from '../structures/canvas';
import { Rig } from './rig';
import { drawArmor, drawBooster, drawHarvester, drawJetpack, JETPACK_LIFT } from './upgrades';
import { ANCHORS, drawEngineer, drawExplorer, drawFarmer, drawRobot, drawScientist } from './suits';

export { JETPACK_LIFT };

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

/** A sprite's frame: its size, and where the feet are in it. */
export const CHARACTER_FRAME = { width: 96, height: 96, originX: 48, originY: 78 };

/** Which slot upgrade is on and its level, plus Armor's level (which is always on). */
export interface CharacterLoadout {
    equipped?: Exclude<UpgradeId, 'armor'> | '';
    /** The equipped slot upgrade's level (1 to its max). */
    level?: number;
    armor?: number;
}

const BODIES: Record<CharacterId, (rig: Rig) => void> = {
    farmer: drawFarmer,
    scientist: drawScientist,
    explorer: drawExplorer,
    engineer: drawEngineer,
    robot: drawRobot,
};

/**
 * Draws a character facing `angle` with its feet at (ox, oy) in `g`. A Jetpack lifts it off the
 * ground and its shadow stays down. `shadow: false` leaves the shadow out (the game draws its own).
 */
export function drawCharacter(
    g: Brush,
    ox: number,
    oy: number,
    id: CharacterId,
    angle: number,
    loadout: CharacterLoadout = {},
    shadow = true
): void {
    const equipped = loadout.equipped || '';
    const level = Math.max(1, loadout.level ?? 1);
    const anchors = ANCHORS[id];
    const rig = new Rig(new Canvas3D(g, ox, oy), angle, equipped === 'wings' ? JETPACK_LIFT : 0);

    if (shadow) rig.shadow(id === 'robot' ? 17 : 13);
    BODIES[id](rig);
    if (equipped === 'booster') drawBooster(rig, anchors, level);
    if (equipped === 'expander') drawHarvester(rig, anchors, level);
    if (equipped === 'wings') drawJetpack(rig, anchors);
    if ((loadout.armor ?? 0) > 0) drawArmor(rig, anchors, loadout.armor ?? 0);
    rig.flush();
}
