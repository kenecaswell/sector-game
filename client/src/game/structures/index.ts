// The structures' art: the Farm, Fabricator, Guard Tower and Power plant, drawn with vector
// graphics (no image files yet). Each type is drawn once per owner color into its own texture
// (`bakeStructure`), so a map full of structures costs one image each; the power plant's smoke is a
// few animated puffs on top (`addSmoke`). The drawing itself is plain math over a `Brush`, kept
// apart from Phaser so the specs can run it (see canvas.ts for the projection and lighting).

import type Phaser from 'phaser';
import type { StructureType } from '../../types/shared';
import { Canvas3D, seededRandom, type Brush, type Pt } from './canvas';
import { drawFabricator } from './fabricator';
import { drawFarm } from './farm';
import { drawGuardTower } from './guardTower';
import { drawPowerPlant, powerSmokeSources } from './powerPlant';

/**
 * The size of a structure's texture, and where its middle (the center of the footprint, on the
 * ground) sits in it. The tallest art (the Guard Tower and the stacks) rises about 100 px.
 */
export const ART_CANVAS = { width: 180, height: 182, originX: 90, originY: 125 };

/**
 * Draws one structure into `g` with its ground center at the canvas origin. `hexCenters` (a Guard
 * Tower only) are its three hexes' centers relative to its middle, in world px.
 */
export function drawStructure(
    g: Brush,
    type: StructureType,
    teamColor: number,
    hexCenters?: Pt[]
): void {
    const c = new Canvas3D(g, ART_CANVAS.originX, ART_CANVAS.originY);
    switch (type) {
        case 'farm':
            return drawFarm(c, teamColor);
        case 'fabricator':
            return drawFabricator(c, teamColor);
        case 'guardTower':
            return drawGuardTower(c, teamColor, hexCenters);
        case 'power':
            return drawPowerPlant(c, teamColor);
    }
}

/** The texture key for a structure's art: type, owner color, and (a tower) the hexes it covers. */
export function structureTextureKey(
    type: StructureType,
    teamColor: number,
    hexCenters?: Pt[]
): string {
    const shape = hexCenters?.map((p) => `${Math.round(p.x)}.${Math.round(p.y)}`).join('_');
    return `structure-${type}-${teamColor.toString(16)}${shape ? `-${shape}` : ''}`;
}

/** Draws the structure into a texture (once per key) and returns its key. */
export function bakeStructure(
    scene: Phaser.Scene,
    type: StructureType,
    teamColor: number,
    hexCenters?: Pt[]
): string {
    const key = structureTextureKey(type, teamColor, hexCenters);
    if (scene.textures.exists(key)) return key;
    const g = scene.make.graphics({}, false);
    drawStructure(g, type, teamColor, hexCenters);
    g.generateTexture(key, ART_CANVAS.width, ART_CANVAS.height);
    g.destroy();
    return key;
}

// --- Smoke -----------------------------------------------------------------------------------

/** Where a type's smoke leaves it, in screen px from the middle of its footprint. */
export function smokeSources(type: StructureType): Pt[] {
    return type === 'power' ? powerSmokeSources() : [];
}

export const SMOKE_KEY = 'structure-smoke';
export const SMOKE_EVERY_MS = 420; // a new puff from each stack this often
export const SMOKE_RISE = 100; // screen px a puff climbs before it is gone
export const SMOKE_MS = 4600; // how long that takes
const SMOKE_TINTS = [0x241b16, 0x33261d, 0x15110f, 0x3d2e22]; // black to dark brown

/** A lumpy, soft-edged puff as a texture: overlapping translucent discs, white so it can be tinted. */
function ensureSmokeTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(SMOKE_KEY)) return;
    const g = scene.make.graphics({}, false);
    g.fillStyle(0xffffff, 0.22);
    g.fillCircle(24, 24, 22);
    const lumps: Array<[number, number, number]> = [
        [24, 24, 15],
        [16, 27, 11],
        [32, 26, 11],
        [22, 15, 10],
        [27, 33, 9],
    ];
    for (const [x, y, radius] of lumps) {
        g.fillStyle(0xffffff, 0.3);
        g.fillCircle(x, y, radius);
        g.fillStyle(0xffffff, 0.22);
        g.fillCircle(x, y, radius * 0.6);
    }
    g.generateTexture(SMOKE_KEY, 48, 48);
    g.destroy();
}

/**
 * A structure's smoke (a power plant's stacks): every SMOKE_EVERY_MS each source lets go of a puff
 * that rises, billows out and fades while it drifts with the wind, then removes itself. `x`, `y` is
 * where the structure's middle is on screen; `destroy` stops it and clears the puffs.
 */
export class SmokeEmitter {
    private readonly scene: Phaser.Scene;
    private readonly timer: Phaser.Time.TimerEvent;
    private readonly puffs = new Set<Phaser.GameObjects.Image>();
    private readonly random: () => number;

    constructor(scene: Phaser.Scene, sources: Pt[], x: number, y: number, depth: number, seed = 1) {
        this.scene = scene;
        this.random = seededRandom(seed);
        ensureSmokeTexture(scene);
        let tick = 0;
        const release = () => {
            sources.forEach((source, s) => {
                // Alternate stacks so they don't puff in step.
                if ((tick + s) % 2 === 1 && sources.length > 1) return;
                this.release(x + source.x, y + source.y, depth);
            });
            tick++;
        };
        this.timer = scene.time.addEvent({
            delay: SMOKE_EVERY_MS / 2,
            loop: true,
            callback: release,
        });
    }

    private release(x: number, y: number, depth: number): void {
        const drift = 16 + this.random() * 16;
        const puff = this.scene.add
            .image(x, y, SMOKE_KEY)
            .setDepth(depth)
            .setAlpha(0.9)
            .setScale(0.35)
            .setAngle(this.random() * 360)
            .setTint(SMOKE_TINTS[Math.floor(this.random() * SMOKE_TINTS.length)]);
        this.puffs.add(puff);
        this.scene.tweens.add({
            targets: puff,
            x: x + drift,
            y: y - SMOKE_RISE,
            scale: 1.35,
            angle: puff.angle + (this.random() < 0.5 ? -40 : 40),
            alpha: { from: 0.9, to: 0, ease: 'Quad.easeIn' },
            duration: SMOKE_MS,
            ease: 'Sine.easeOut',
            onComplete: () => {
                this.puffs.delete(puff);
                puff.destroy();
            },
        });
    }

    destroy(): void {
        this.timer.remove(false);
        for (const puff of this.puffs) {
            this.scene.tweens.killTweensOf(puff);
            puff.destroy();
        }
        this.puffs.clear();
    }
}
