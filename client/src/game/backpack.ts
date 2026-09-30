// How a backpack looks: the weapons and upgrades you dropped where you were defeated. Only you see
// yours. A canvas backpack with a top flap, a front pocket, straps and a brass buckle, sitting on the
// ground over a softly pulsing ring. Placeholder until there's art.

import type Phaser from 'phaser';
import {
    BACKPACK_BODY_COLOR,
    BACKPACK_BUCKLE_COLOR,
    BACKPACK_FLAP_COLOR,
    BACKPACK_OUTLINE_COLOR,
    BACKPACK_POCKET_COLOR,
    BACKPACK_RING_COLOR,
    BACKPACK_STRAP_COLOR,
} from './constants';

/** Draws the backpack centered on (0, 0) of `g` (screen px, y down), about 20 x 24 px. */
export function drawBackpack(g: Phaser.GameObjects.Graphics): void {
    // Carry handle, behind the body.
    g.lineStyle(2, BACKPACK_STRAP_COLOR, 1);
    g.strokeRoundedRect(-4, -15, 8, 6, 3);
    // Body.
    g.fillStyle(BACKPACK_BODY_COLOR, 1);
    g.fillRoundedRect(-10, -11, 20, 22, 6);
    // Top flap, darker, over the upper part.
    g.fillStyle(BACKPACK_FLAP_COLOR, 1);
    g.fillRoundedRect(-10, -11, 20, 9, { tl: 6, tr: 6, bl: 3, br: 3 });
    // Front pocket.
    g.fillStyle(BACKPACK_POCKET_COLOR, 1);
    g.fillRoundedRect(-6, 2, 12, 7, 2);
    g.lineStyle(1, BACKPACK_STRAP_COLOR, 0.8);
    g.strokeRoundedRect(-6, 2, 12, 7, 2);
    // Two straps down from the flap, and the buckle on the flap's edge.
    g.fillStyle(BACKPACK_STRAP_COLOR, 1);
    g.fillRect(-6, -3, 2, 5);
    g.fillRect(4, -3, 2, 5);
    g.fillStyle(BACKPACK_BUCKLE_COLOR, 1);
    g.fillRect(-2, -4, 4, 3);
    g.lineStyle(1.5, BACKPACK_OUTLINE_COLOR, 0.9);
    g.strokeRoundedRect(-10, -11, 20, 22, 6);
}

/** The ring on the ground under a backpack (an ellipse in screen px), faded in and out by a tween. */
export function drawBackpackRing(
    g: Phaser.GameObjects.Graphics,
    width: number,
    height: number
): void {
    g.lineStyle(2, BACKPACK_RING_COLOR, 0.9);
    g.strokeEllipse(0, 0, width, height);
    g.fillStyle(BACKPACK_RING_COLOR, 0.15);
    g.fillEllipse(0, 0, width, height);
}
