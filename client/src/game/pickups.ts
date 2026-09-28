// How a pickup looks: every one is the same drop pod (a steel canister with a glowing band and
// fins), so nobody can tell what's inside until they open it. Placeholder until there's art.

import type Phaser from 'phaser';
import {
    POD_BODY_COLOR,
    POD_FIN_COLOR,
    POD_HIGHLIGHT_COLOR,
    POD_LIGHT_COLOR,
    POD_OUTLINE_COLOR,
    POD_SHADE_COLOR,
} from './constants';

type Pt = { x: number; y: number };
const points = (list: Pt[]) => list as Phaser.Math.Vector2[];

/** Draws the drop pod centered on (0, 0) of `g` (screen px, y down), about 22 x 26 px. */
export function drawDropPod(g: Phaser.GameObjects.Graphics): void {
    // Fins, behind the body.
    g.fillStyle(POD_FIN_COLOR, 1);
    g.fillPoints(
        points([
            { x: -6, y: 3 },
            { x: -11, y: 11 },
            { x: -5, y: 9 },
        ]),
        true
    );
    g.fillPoints(
        points([
            { x: 6, y: 3 },
            { x: 11, y: 11 },
            { x: 5, y: 9 },
        ]),
        true
    );
    // Body: a capsule, its right side in shade, with a highlight down the left.
    g.fillStyle(POD_BODY_COLOR, 1);
    g.fillRoundedRect(-7, -12, 14, 22, 6);
    g.fillStyle(POD_SHADE_COLOR, 1);
    g.fillRoundedRect(1, -11, 5, 20, { tl: 0, tr: 5, bl: 0, br: 5 });
    g.fillStyle(POD_HIGHLIGHT_COLOR, 0.9);
    g.fillRoundedRect(-5, -9, 2, 14, 1);
    // Thruster nozzle.
    g.fillStyle(POD_FIN_COLOR, 1);
    g.fillRect(-3, 10, 6, 3);
    g.lineStyle(1.5, POD_OUTLINE_COLOR, 0.9);
    g.strokeRoundedRect(-7, -12, 14, 22, 6);
    // The band the glow sits on.
    g.fillStyle(POD_LIGHT_COLOR, 1);
    g.fillRect(-7, -3, 14, 3);
}

/** The pod's pulsing light: a soft halo around its band, faded in and out by a tween. */
export function drawDropPodGlow(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(POD_LIGHT_COLOR, 0.35);
    g.fillEllipse(0, -1.5, 22, 9);
    g.fillStyle(POD_LIGHT_COLOR, 0.5);
    g.fillEllipse(0, -1.5, 16, 5);
}
