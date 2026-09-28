// A player's spawn platform: a low, round metal pad on the hex they start and respawn on, with a
// small light in their team color. Placeholder art, drawn with Phaser graphics.

import type Phaser from 'phaser';
import {
    HEX_SIZE,
    ISO_SQUASH,
    POD_BODY_COLOR,
    POD_OUTLINE_COLOR,
    POD_SHADE_COLOR,
} from './constants';

export const SPAWN_PAD_RADIUS = HEX_SIZE * 0.72; // world px: inside its hex with a margin
const THICKNESS = 4; // screen px of rim below the top face

/** Draws the pad centered on (0, 0) of `g`, in scene space (already squashed for the iso view). */
export function drawSpawnPad(g: Phaser.GameObjects.Graphics, teamColor: number): void {
    const w = SPAWN_PAD_RADIUS * 2;
    const h = w * ISO_SQUASH;
    // The rim: the same ellipse shifted down, so the pad reads as a low disc.
    g.fillStyle(POD_SHADE_COLOR, 1);
    g.fillEllipse(0, THICKNESS, w, h);
    g.fillRect(-w / 2, 0, w, THICKNESS);
    // Top face, an inset ring and a lighter center plate.
    g.fillStyle(POD_BODY_COLOR, 1);
    g.fillEllipse(0, 0, w, h);
    g.lineStyle(1.5, POD_OUTLINE_COLOR, 0.8);
    g.strokeEllipse(0, 0, w, h);
    g.lineStyle(2, POD_SHADE_COLOR, 1);
    g.strokeEllipse(0, 0, w * 0.68, h * 0.68);
    g.fillStyle(0xb8c2cb, 1);
    g.fillEllipse(0, 0, w * 0.4, h * 0.4);
    // Team light in the middle.
    g.fillStyle(teamColor, 1);
    g.fillEllipse(0, 0, w * 0.16, h * 0.16);
}
