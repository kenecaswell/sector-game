// How a pickup looks: small placeholder shapes, one hex in size, until there are sprites.
// `pickupLook` decides what to draw (pure, unit-tested); `drawPickup` draws it with Phaser.

import type Phaser from 'phaser';
import { SHOP_ITEMS, isShopItemId } from '../types/shared';
import {
    PICKUP_AMMO_COLOR,
    PICKUP_AMMO_TIP_COLOR,
    PICKUP_CRATE_COLOR,
    PICKUP_CRATE_EDGE_COLOR,
    PICKUP_GUN_COLORS,
    PICKUP_OUTLINE_COLOR,
    PICKUP_UPGRADE_COLORS,
    STRUCTURE_COLORS,
    STRUCTURE_DEFAULT_COLOR,
} from './constants';

export type PickupShape = 'crate' | 'ammo' | 'gun' | 'upgrade' | 'structure';

export interface PickupLook {
    shape: PickupShape;
    color: number;
    scale: number; // 1 = normal; the big gun is drawn larger
}

/**
 * Materials: a wooden crate. Ammo: three brass rounds. Guns: a pistol shape, white (basic) or a larger
 * yellow (big), matching their shots. Upgrades: a diamond in the upgrade's color. Structures: a tiny
 * slab in the structure type's color, like the real ones.
 */
export function pickupLook(kind: string, itemId: string): PickupLook {
    if (kind === 'materials') return { shape: 'crate', color: PICKUP_CRATE_COLOR, scale: 1 };
    if (kind === 'ammo') return { shape: 'ammo', color: PICKUP_AMMO_COLOR, scale: 1 };
    const item = isShopItemId(itemId) ? SHOP_ITEMS[itemId] : undefined;
    if (item?.gun) {
        return {
            shape: 'gun',
            color: PICKUP_GUN_COLORS[itemId] ?? 0xffffff,
            scale: item.gun === 'big' ? 1.3 : 1,
        };
    }
    if (item?.upgrade) {
        return {
            shape: 'upgrade',
            color: PICKUP_UPGRADE_COLORS[item.upgrade] ?? 0xffffff,
            scale: 1,
        };
    }
    const color = (item?.structure && STRUCTURE_COLORS[item.structure]) || STRUCTURE_DEFAULT_COLOR;
    return { shape: 'structure', color, scale: 1 };
}

type Pt = { x: number; y: number };

/** Draws `look` centered on (0, 0) of `g` (screen px, y down). Fits inside about 26 x 22 px. */
export function drawPickup(g: Phaser.GameObjects.Graphics, look: PickupLook): void {
    const s = look.scale;
    const poly = (points: Pt[], fill: number, outline = true) => {
        g.fillStyle(fill, 1);
        g.fillPoints(points as Phaser.Math.Vector2[], true);
        if (outline) {
            g.lineStyle(1.5, PICKUP_OUTLINE_COLOR, 0.9);
            g.strokePoints(points as Phaser.Math.Vector2[], true);
        }
    };

    switch (look.shape) {
        case 'crate': {
            // A small box seen from above and in front: a lighter lid over a front face with a brace.
            const lid = [
                { x: -9, y: -7 },
                { x: 9, y: -7 },
                { x: 7, y: -3 },
                { x: -7, y: -3 },
            ];
            poly(lid, blend(look.color, 0xffffff, 0.25));
            const front = [
                { x: -7, y: -3 },
                { x: 7, y: -3 },
                { x: 7, y: 8 },
                { x: -7, y: 8 },
            ];
            poly(front, look.color);
            g.lineStyle(1.5, PICKUP_CRATE_EDGE_COLOR, 1);
            g.lineBetween(-7, -3, 7, 8);
            g.lineBetween(-7, 2.5, 7, 2.5);
            break;
        }
        case 'ammo':
            for (const dx of [-6, 0, 6]) {
                g.fillStyle(look.color, 1);
                g.fillRect(dx - 2, -4, 4, 10);
                g.fillStyle(PICKUP_AMMO_TIP_COLOR, 1);
                g.fillTriangle(dx - 2, -4, dx + 2, -4, dx, -9);
                g.lineStyle(1, PICKUP_OUTLINE_COLOR, 0.8);
                g.strokeRect(dx - 2, -4, 4, 10);
            }
            break;
        case 'gun':
            // A pistol facing right: barrel along the top, grip down on the left.
            poly(
                [
                    { x: -9, y: -5 },
                    { x: 10, y: -5 },
                    { x: 10, y: 0 },
                    { x: -2, y: 0 },
                    { x: -4, y: 7 },
                    { x: -9, y: 7 },
                ].map((p) => ({ x: p.x * s, y: p.y * s })),
                look.color
            );
            break;
        case 'upgrade':
            poly(
                [
                    { x: 0, y: -10 },
                    { x: 8, y: 0 },
                    { x: 0, y: 10 },
                    { x: -8, y: 0 },
                ],
                look.color
            );
            g.fillStyle(0xffffff, 0.6);
            g.fillTriangle(0, -10, 8, 0, 0, -2); // a highlight on the upper facet
            break;
        case 'structure': {
            // A tiny flat-top hexagon slab: top face in the type's color over a dark side face.
            const r = 10;
            const height = 4;
            const top = Array.from({ length: 6 }, (_, i) => ({
                x: r * Math.cos((Math.PI / 3) * i),
                y: r * Math.sin((Math.PI / 3) * i) * 0.6 - height / 2,
            }));
            const base = top.map((p) => ({ x: p.x, y: p.y + height }));
            poly([top[0], base[0], base[1], base[2], base[3], top[3]], 0x3a3a3a, false);
            poly(top, look.color);
            break;
        }
    }
}

/** `a` moved `t` of the way toward `b` (0xRRGGBB colors). */
function blend(a: number, b: number, t: number): number {
    const mix = (shift: number) =>
        Math.round(((a >> shift) & 0xff) * (1 - t) + ((b >> shift) & 0xff) * t) << shift;
    return mix(16) | mix(8) | mix(0);
}
