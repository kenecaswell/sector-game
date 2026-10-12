// What each upgrade looks like when a character has it on: bolted onto the body at the anchors the
// suit gives. The slot upgrades (Booster, Harvester, Jetpack) show only while equipped, Armor
// always shows; a higher level adds more.

import type { Rig } from './rig';
import type { Anchors } from './suits';

const STEEL = 0x8e9aa6;
const STEEL_DARK = 0x5d6873;
const FLAME_OUTER = 0xff8a2a;
const FLAME_INNER = 0xffe27a;

/** How high the Jetpack holds the character off the ground (screen px). */
export const JETPACK_LIFT = 7;

/** Thrusters on the back: two small pods, two larger finned ones, then three. */
export function drawBooster(rig: Rig, a: Anchors, level: number): void {
    const count = level >= 3 ? 3 : 2;
    const radius = 1.5 + level * 0.45;
    const length = 6 + level * 1.6;
    const z1 = a.back.z - 1 + length / 2;
    const v = a.back.v - 2.8 - radius;
    for (let i = 0; i < count; i++) {
        const u = count === 3 ? (i - 1) * (radius * 2 + 0.8) : (i === 0 ? -1 : 1) * (radius + 1.4);
        const z0 = z1 - length;
        rig.cyl(u, v, radius, radius * 0.85, z0, z1, STEEL, { sides: 8 });
        rig.cyl(u, v, radius * 1.15, radius * 1.15, z1 - 1.2, z1, STEEL_DARK, {
            sides: 8,
            bias: 0.1,
        });
        // The nozzle and its blue-white flame.
        rig.cyl(u, v, radius * 0.9, radius * 1.15, z0 - 1.2, z0, STEEL_DARK, {
            sides: 8,
            bias: 0.1,
        });
        rig.tube(
            [u, v, z0 - 1.2 - 2 - level * 1.8],
            [u, v, z0 - 1.2],
            0.1,
            radius * 0.9,
            0x58d0ff,
            { sides: 8, outline: false, alpha: 0.85, bias: 0.2 }
        );
        rig.tube([u, v, z0 - 1.2 - 1.2 - level], [u, v, z0 - 1.2], 0.1, radius * 0.5, 0xe8fbff, {
            sides: 6,
            outline: false,
            bias: 0.3,
        });
    }
    if (level >= 2) {
        // Stabilizer fins.
        rig.box(
            -radius * 2.6,
            radius * 2.6,
            v - 0.5,
            v + 0.5,
            a.back.z - 1,
            a.back.z + 1.2,
            0x56d8ff,
            { bias: 0.1 }
        );
    }
}

/** The harvester's size per level: how many hexagon cells (1, 7, 19) and how big each is. */
export const HARVESTER_CELLS = [
    { rings: 0, size: 5.8 },
    { rings: 1, size: 3.5 },
    { rings: 2, size: 2.6 },
];

/**
 * The Harvester: a honeycomb tray held out behind the shoulders on a mast, flat so it shows from
 * every side. It has 1, then 7, then 19 glowing green hexagon cells, the number of hexes you claim.
 */
export function drawHarvester(rig: Rig, a: Anchors, level: number): void {
    const { rings, size } = HARVESTER_CELLS[Math.min(Math.max(level, 1), 3) - 1];
    const gap = 1.07;
    const reach = size * (1 + 1.5 * rings) * gap; // from the tray's middle to its farthest corner
    const v = a.back.v - 1.5 - reach;
    const z = a.back.z + 8;
    rig.rod([0, a.back.v, a.back.z + 2], [0, v, z - 1.4], 1.1, STEEL_DARK);
    const cells: [number, number][] = [];
    for (let q = -rings; q <= rings; q++) {
        for (let p = -rings; p <= rings; p++) {
            if (Math.abs(q + p) > rings) continue;
            cells.push([size * gap * 1.5 * q, size * gap * Math.sqrt(3) * (p + q / 2)]);
        }
    }
    cells.forEach(([du, dv], i) => {
        const color = [0x6fdc84, 0x58c870, 0x8ff09c][i % 3];
        rig.cyl(du, v + dv, size, size, z - 1.4, z, color, { sides: 6, bias: i * 0.01 });
    });
    rig.glow([0, v, z + 0.2], Math.min(size, 3.2) * 0.45, 0xeaffd8, 0.9, { bias: 4 });
}

/** The Jetpack: a fat pack with two engines and flames; the character hovers (see JETPACK_LIFT). */
export function drawJetpack(rig: Rig, a: Anchors): void {
    const v = a.back.v - 4.6;
    rig.box(-6.4, 6.4, v - 3.2, v + 3.2, a.back.z - 8, a.back.z + 8, STEEL, { taper: 0.8 });
    rig.box(-4, 4, v - 3.8, v - 3.2, a.back.z - 4, a.back.z + 5, 0x3a444d, { bias: 0.2 });
    for (const side of [-1, 1]) {
        const u = side * 3.8;
        rig.cyl(u, v - 1, 2.8, 2.4, a.back.z - 11, a.back.z - 8, STEEL_DARK, {
            sides: 9,
            bias: 0.1,
        });
        rig.tube([u, v - 1, a.back.z - 21], [u, v - 1, a.back.z - 11], 0.2, 2.6, FLAME_OUTER, {
            sides: 9,
            outline: false,
            alpha: 0.9,
            bias: 0.2,
        });
        rig.tube([u, v - 1, a.back.z - 17], [u, v - 1, a.back.z - 11], 0.2, 1.5, FLAME_INNER, {
            sides: 7,
            outline: false,
            bias: 0.3,
        });
        rig.cyl(u, v - 1, 1.1, 1.1, a.back.z + 8, a.back.z + 10.4, 0xd5dde3, {
            sides: 6,
            bias: 0.1,
        });
    }
    rig.glow([0, v - 3.9, a.back.z + 2], 1.2, 0xffe27a, 1, { bias: 0.9 });
}

/** Armor: a chest plate; then shoulder and forearm guards; then shin guards and a helmet crest. */
export function drawArmor(rig: Rig, a: Anchors, level: number): void {
    const t = a.torso;
    if (a.head) {
        rig.box(-t.u - 0.9, t.u + 0.9, -t.v - 1, t.v + 1.1, t.z1 - 8, t.z1 + 0.4, STEEL, {
            taper: 1.1,
            bias: 0.4,
        });
        rig.plate(
            [
                [-2.4, t.v + 1.2, t.z1 - 1.6],
                [2.4, t.v + 1.2, t.z1 - 1.6],
                [2.4, t.v + 1.2, t.z1 - 6.4],
                [-2.4, t.v + 1.2, t.z1 - 6.4],
            ],
            [0, 1, 0],
            0xf2c14e,
            { bias: 1 }
        );
    } else {
        // The Robot: bolt-on panels over the sides of its body.
        for (const side of [-1, 1]) {
            rig.box(side * t.u, side * (t.u + 1.6), -t.v + 1, t.v - 1, t.z0 + 2, t.z1 - 2, STEEL, {
                taper: 0.3,
                bias: 0.3,
            });
        }
    }
    if (level >= 2) {
        if (a.head) {
            for (const side of [-1, 1]) {
                rig.blob(
                    [side * (a.shoulder.u + 0.6), 0, a.shoulder.z + 0.6],
                    4.4,
                    4.2,
                    3.4,
                    STEEL,
                    { bands: 4, sides: 10, bias: 0.6 }
                );
                rig.tube([side * 8.6, 3, 20], [side * 8.1, 1.4, 25.4], 2.9, 3.1, STEEL_DARK, {
                    sides: 8,
                    bias: 0.5,
                });
            }
        } else {
            rig.box(
                -t.u - 0.5,
                t.u + 0.5,
                -t.v - 0.5,
                t.v + 0.5,
                t.z1 - 1,
                t.z1 + 1.4,
                STEEL_DARK,
                { taper: 1.2, bias: 0.3 }
            );
        }
    }
    if (level >= 3) {
        if (a.head) {
            for (const side of [-1, 1]) {
                rig.tube([side * 3.6, 0.4, 4.6], [side * 3.6, 0.6, 12.4], 3.3, 3.4, STEEL, {
                    bias: 0.5,
                });
            }
            const h = a.head;
            rig.rod([0, -h.rv + 1, h.z + h.rz - 2.4], [0, -1, h.z + h.rz + 0.2], 1.2, STEEL, {
                bias: 0.5,
            });
            rig.rod([0, -1, h.z + h.rz + 0.2], [0, h.rv - 2, h.z + h.rz - 1.4], 1.2, STEEL, {
                bias: 0.5,
            });
        } else {
            rig.box(-t.u + 1.5, t.u - 1.5, -t.v + 1.5, t.v - 1.5, t.z1 + 1.4, t.z1 + 3, STEEL, {
                taper: 1,
                bias: 0.3,
            });
        }
        rig.glow([0, t.v + 1.3, t.z0 + 3], 0.9, 0xffd34a, 1, { bias: 1.2 });
    }
}
