// What every structure's art shares: the pad it stands on, made of the hexes it covers and in the
// owner's team color, and the flag.

import { HEX_SIZE, STRUCTURE_BORDER_WIDTH, STRUCTURE_SIDE_DARKEN } from '../constants';
import { mixColor } from '../terrainArt';
import { Canvas3D, ring, seededRandom, shadeColor, lightFactor, type Pt, type V3 } from './canvas';

export const PAD_HEIGHT = 3; // screen px the pad is raised: everything stands on z = PAD_HEIGHT

/**
 * The centers of the 7 hexes a farm, fabricator or power plant covers, relative to the middle
 * one, in world px: the middle, and six neighbors a hex apart (flat-top hexes, so at 30°, 90°, ...).
 */
export const SEVEN_HEX_CENTERS: Pt[] = [
    { x: 0, y: 0 },
    ...Array.from({ length: 6 }, (_, k) => {
        const angle = Math.PI / 6 + (k * Math.PI) / 3;
        const distance = Math.sqrt(3) * HEX_SIZE;
        return { x: distance * Math.cos(angle), y: distance * Math.sin(angle) };
    }),
];

/**
 * A structure's pad: the hexes it covers (`centers`, relative to its middle) raised together in
 * the owner's color: sides in a dark shade of it, a top in a deeper shade with a little grit and a
 * lighter line inside each hex, like the marking on a landing pad, and the bright team edge on the
 * outside only, so the hexes read as one piece.
 */
export function drawHexPad(c: Canvas3D, centers: Pt[], teamColor: number, seed = 1): void {
    const side = mixColor(teamColor, 0x000000, STRUCTURE_SIDE_DARKEN);
    const top = mixColor(teamColor, 0x14171b, 0.5);
    const shapes = centers.map((m) => ring(m.x, m.y, HEX_SIZE, 6));
    const random = seededRandom(seed);
    for (const shape of shapes) c.prism(shape, 0, PAD_HEIGHT, side, { top: null });
    for (const shape of shapes)
        c.fill(
            shape.map((q) => c.p(q.x, q.y, PAD_HEIGHT)),
            top
        );
    centers.forEach((m, k) => {
        const flat = shapes[k].map((q) => c.p(q.x, q.y, PAD_HEIGHT));
        c.speckle(
            flat,
            random,
            60,
            [mixColor(teamColor, 0x000000, 0.7), mixColor(teamColor, 0xffffff, 0.35)],
            0.45,
            1.2
        );
        c.g.lineStyle(1, mixColor(teamColor, 0xffffff, 0.3), 0.45);
        c.g.strokePoints(
            ring(m.x, m.y, HEX_SIZE - 4, 6).map((q) => c.p(q.x, q.y, PAD_HEIGHT)),
            true
        );
    });
    c.g.lineStyle(STRUCTURE_BORDER_WIDTH, teamColor, 1);
    centers.forEach((m, k) => {
        shapes[k].forEach((q, i) => {
            const next = shapes[k][(i + 1) % 6];
            const mid = { x: (q.x + next.x) / 2, y: (q.y + next.y) / 2 };
            // An edge shared with another of the hexes lies halfway between their centers.
            const shared = centers.some(
                (other, j) =>
                    j !== k &&
                    Math.hypot(mid.x - (m.x + other.x) / 2, mid.y - (m.y + other.y) / 2) < 1
            );
            if (shared) return;
            const [a, b] = [c.p(q.x, q.y, PAD_HEIGHT), c.p(next.x, next.y, PAD_HEIGHT)];
            c.g.lineBetween(a.x, a.y, b.x, b.y);
        });
    });
}

/** A flag on a pole: the team's color, so a building also shows who owns it from a distance. */
export function drawFlag(
    c: Canvas3D,
    x: number,
    y: number,
    z: number,
    height: number,
    teamColor: number
): void {
    c.line([x, y, z], [x, y, z + height], 1.4, 0x3b3f44);
    const top = z + height;
    const flag = [
        c.p(x, y, top),
        c.p(x + 9, y, top - 1.5),
        c.p(x + 7.5, y, top - 4),
        c.p(x + 9, y, top - 6.5),
        c.p(x, y, top - 6),
    ];
    c.fill(flag, shadeColor(teamColor, lightFactor([0, 1, 0]) + 0.1));
}

// --- The 2078 look: cool light as an accent ---------------------------------------------------------
export const CYAN = 0x39e6ff; // the standard indicator and strip light
export const AMBER = 0xffb13b; // work lights, warnings
export const HOT_RED = 0xff4d3d; // alert lights

/** A bar of light between two 3D points: a soft wide halo with a bright thin core. */
export function glowLine(
    c: Canvas3D,
    a: V3,
    b: V3,
    color: number,
    width = 1.3,
    strength = 1
): void {
    c.line(a, b, width + 3, color, 0.16 * strength);
    c.line(a, b, width + 1.4, color, 0.3 * strength);
    c.line(a, b, width, shadeColor(color, 1.35), 0.95 * strength);
}

/** A small lit lamp at a 3D point. */
export function glowDot(
    c: Canvas3D,
    x: number,
    y: number,
    z: number,
    color: number,
    r = 1.2
): void {
    const at = c.p(x, y, z);
    c.g.fillStyle(color, 0.22);
    c.g.fillCircle(at.x, at.y, r * 2.6);
    c.g.fillStyle(color, 0.45);
    c.g.fillCircle(at.x, at.y, r * 1.6);
    c.g.fillStyle(shadeColor(color, 1.4), 1);
    c.g.fillCircle(at.x, at.y, r);
}

/** A thick steel pipe through 3D points: a dark outline, a bright core, a highlight, clamp rings. */
export function pipe(
    c: Canvas3D,
    points: V3[],
    o: { width?: number; dark?: number; light?: number } = {}
): void {
    const width = o.width ?? 4.4;
    const layers: Array<[number, number, number]> = [
        [width, o.dark ?? 0x40474e, 1],
        [width * 0.62, o.light ?? 0xc0c8ce, 1],
        [width * 0.2, 0xf1f5f7, 0.75],
    ];
    for (const [w, color, alpha] of layers) {
        for (let i = 0; i + 1 < points.length; i++)
            c.line(points[i], points[i + 1], w, color, alpha);
    }
    for (let i = 0; i + 1 < points.length; i++) {
        const [a, b] = [points[i], points[i + 1]];
        const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        for (let t = 5; t < length - 2; t += 8) {
            const k = t / length;
            const at = c.p(
                a[0] + (b[0] - a[0]) * k,
                a[1] + (b[1] - a[1]) * k,
                a[2] + (b[2] - a[2]) * k
            );
            c.g.fillStyle(0x30363c, 0.9);
            c.g.fillRect(at.x - width * 0.32, at.y - width * 0.32, width * 0.64, width * 0.64);
        }
    }
}
