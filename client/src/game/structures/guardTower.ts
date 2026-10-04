// The Guard Tower: a sentry tower from 2078, built on the same plan as the old prison towers (four
// legs, tiers of bracing, a landing, a small room on top with a roof and a gun) in new materials:
// graphite composite legs lit along one edge, a clean truss with glowing joints, a glass landing,
// a lift where the ladder was, a faceted smoked-glass cabin, a solar canopy over a sensor dome, and
// an automated twin-barrel rail gun on a gimbal. Its pad is the three hexes it occupies.

import { Canvas3D, ring, type Pt, type V3 } from './canvas';
import { CYAN, HOT_RED, PAD_HEIGHT, drawFlag, drawHexPad, glowDot, glowLine } from './common';

const Z = PAD_HEIGHT;
const LEG_HEIGHT = 56; // to the deck
const BASE = { x: 14, y: 10 }; // half-size of the legs' square at the bottom...
const TOP = { x: 9.5, y: 6.5 }; // ...and at the deck: the tower tapers
const TIER_LEVELS = [0, 19, 38, 56];
const GRAPHITE = 0x2b3238;
const GRAPHITE_LIGHT = 0x4b5761;
const PANEL = 0xcfd7dd; // pale composite panels
const GLASS = 0x10202a;

/** The tower's half-width and half-depth at height `up` above the pad. */
function halfAt(up: number): { x: number; y: number } {
    const t = up / LEG_HEIGHT;
    return { x: BASE.x + (TOP.x - BASE.x) * t, y: BASE.y + (TOP.y - BASE.y) * t };
}

/**
 * `hexCenters`: the three hexes' centers relative to the tower's middle (their average), world
 * px. Without them (a preview) one hex is drawn at the middle.
 */
export function drawGuardTower(
    c: Canvas3D,
    teamColor: number,
    hexCenters: Pt[] = [{ x: 0, y: 0 }]
): void {
    drawHexPad(c, hexCenters, teamColor, 0x7a3e);
    foundations(c);

    // Back to front: the back truss and legs, the landing, the sides, the front, then the top.
    truss(c, -1, 0x39444d, false);
    for (const sx of [-1, 1]) leg(c, sx, -1, 0x1f252a, 0x394650);
    glassLanding(c, 38);
    for (const sx of [-1, 1]) sideTruss(c, sx);
    truss(c, 1, 0x72818d, true);
    lift(c);
    for (const sx of [-1, 1]) leg(c, sx, 1, GRAPHITE, GRAPHITE_LIGHT);

    deck(c, teamColor);
    cabin(c);
    canopy(c, teamColor);
    glassRail(c);
    gun(c);
}

/** Hexagonal footings under the legs, each with a lit ring. */
function foundations(c: Canvas3D): void {
    for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
            c.cylinder(
                sx * BASE.x,
                sy * BASE.y,
                3.6,
                3.6,
                Z,
                Z + 1.6,
                0x1b2024,
                { top: 0x2d353b },
                6
            );
            c.cylinder(
                sx * BASE.x,
                sy * BASE.y,
                3,
                3,
                Z + 1.6,
                Z + 2.2,
                0x56636d,
                { top: 0x6e7c87 },
                6
            );
        }
    }
}

/** One leg: a slim composite bar from the pad up to the deck, with a lit edge. */
function leg(c: Canvas3D, sx: number, sy: number, color: number, light: number): void {
    const b = c.p(sx * BASE.x, sy * BASE.y, Z + 2);
    const t = c.p(sx * TOP.x, sy * TOP.y, Z + LEG_HEIGHT);
    c.fill(
        [
            { x: b.x - 2, y: b.y },
            { x: b.x + 2, y: b.y },
            { x: t.x + 1.8, y: t.y },
            { x: t.x - 1.8, y: t.y },
        ],
        color
    );
    c.g.lineStyle(0.9, light, 0.95);
    c.g.lineBetween(b.x - 1, b.y, t.x - 0.9, t.y);
    if (sy > 0) {
        // A strip of light along the front legs' inner edge.
        glowLine(
            c,
            [sx * (BASE.x - 1), sy * BASE.y, Z + 6],
            [sx * (TOP.x - 0.9), sy * TOP.y, Z + LEG_HEIGHT - 3],
            CYAN,
            0.6,
            0.55
        );
    }
}

/** A zigzag truss on the front (sy = 1) or back (-1) plane, a glowing node at every joint. */
function truss(c: Canvas3D, sy: number, color: number, nodes: boolean): void {
    const lit = (level: number, side: number): V3 => {
        const h = halfAt(level);
        return [side * h.x, sy * h.y, Z + level];
    };
    for (let i = 0; i < TIER_LEVELS.length - 1; i++) {
        const [a, b] = [TIER_LEVELS[i], TIER_LEVELS[i + 1]];
        // Each tier slants one way, the next the other: a W up the face.
        const from = i % 2 === 0 ? -1 : 1;
        c.line(lit(a, from), lit(b, -from), 1.5, color);
        // A cross-tie at the top of each tier.
        c.line(lit(b, -1), lit(b, 1), 1.4, color);
        if (nodes) {
            glowDot(c, -from * halfAt(b).x, sy * halfAt(b).y, Z + b, CYAN, 0.8);
            glowDot(c, from * halfAt(a).x, sy * halfAt(a).y, Z + a, CYAN, 0.8);
        }
    }
}

/** Slanting struts on a side plane (running front to back). */
function sideTruss(c: Canvas3D, sx: number): void {
    for (let i = 0; i < TIER_LEVELS.length - 1; i++) {
        const [a, b] = [TIER_LEVELS[i], TIER_LEVELS[i + 1]];
        const [ha, hb] = [halfAt(a), halfAt(b)];
        const dir = i % 2 === 0 ? 1 : -1;
        c.line(
            [sx * ha.x, -dir * ha.y, Z + a],
            [sx * hb.x, dir * hb.y, Z + b],
            1,
            sx < 0 ? 0x333c43 : 0x293035
        );
    }
}

/** A glass-floored landing halfway up with a glowing edge. */
function glassLanding(c: Canvas3D, up: number): void {
    const h = halfAt(up);
    c.box(-h.x, h.x, -h.y, h.y, Z + up, Z + up + 1.2, 0x2b353d, { top: null });
    c.poly(
        [
            [-h.x, -h.y, Z + up + 1.2],
            [h.x, -h.y, Z + up + 1.2],
            [h.x, h.y, Z + up + 1.2],
            [-h.x, h.y, Z + up + 1.2],
        ],
        0x6ac8dc,
        0.35,
        { width: 0.8, color: 0x2b353d }
    );
    glowLine(c, [-h.x, h.y, Z + up + 0.6], [h.x, h.y, Z + up + 0.6], CYAN, 0.8, 0.8);
}

/** The lift that replaced the ladder: two rails up the front and a lit capsule riding them. */
function lift(c: Canvas3D): void {
    const rails = [-2.4, 2.4];
    const at = (x: number, t: number): V3 => {
        const y = BASE.y + 2.4 + (TOP.y + 1 - (BASE.y + 2.4)) * t;
        return [x, y, Z + 2 + (LEG_HEIGHT - 2) * t];
    };
    for (const x of rails) c.line(at(x, 0), at(x, 1), 1.2, 0x68757f);
    for (const x of rails) c.line(at(x, 0), at(x, 1), 0.4, 0xd6dde2, 0.6);
    // The capsule, partway up.
    const t = 0.34;
    const [a, b] = [at(-2.4, t), at(2.4, t)];
    const base = c.p(a[0], a[1], a[2]);
    c.g.fillStyle(0xe8edf0, 1);
    c.g.fillRect(base.x - 0.5, base.y - 8, b[0] - a[0] + 1, 8);
    c.g.fillStyle(0x15262f, 1);
    c.g.fillRect(base.x + 0.5, base.y - 6.5, b[0] - a[0] - 1, 3.4);
    glowDot(c, a[0] + 2.4, a[1], a[2] + 8.6, CYAN, 0.6);
}

/** The top deck: a dark composite slab with a team-colored light along its front. */
function deck(c: Canvas3D, teamColor: number): void {
    const [hx, hy, z0] = [13.5, 10.5, Z + LEG_HEIGHT];
    c.box(-hx, hx, -hy, hy, z0, z0 + 2.4, 0x2a3138, { top: 0x3d4851 });
    glowLine(c, [-hx, hy, z0 + 1.1], [hx, hy, z0 + 1.1], teamColor, 1.6, 1);
    // Underside lights.
    for (const x of [-9, -3, 3, 9]) glowDot(c, x, hy - 1, z0 - 0.4, CYAN, 0.5);
}

/** The cabin: an eight-sided room of pale panels, a band of smoked glass round it with a HUD line. */
function cabin(c: Canvas3D): void {
    const [z0, z1] = [Z + LEG_HEIGHT + 2.4, Z + LEG_HEIGHT + 24];
    const spin = Math.PI / 8;
    c.loft(ring(0, 0, 10, 8, spin), ring(0, 0, 10, 8, spin), z0, z1, PANEL, { top: null });
    // A darker plinth, and the smoked glass band with a bright line across each face.
    c.loft(ring(0, 0, 10.2, 8, spin), ring(0, 0, 10.2, 8, spin), z0, z0 + 3, 0x4a5660, {
        top: null,
    });
    c.loft(ring(0, 0, 10.35, 8, spin), ring(0, 0, 10.35, 8, spin), z0 + 8, z0 + 17, GLASS, {
        top: null,
        face: (quad) => {
            const mid = (a: Pt, b: Pt, t: number): Pt => ({
                x: a.x + (b.x - a.x) * t,
                y: a.y + (b.y - a.y) * t,
            });
            // quad: bottom-left, bottom-right, top-right, top-left (outward faces run either way).
            const left = mid(quad[0], quad[3], 0.55);
            const right = mid(quad[1], quad[2], 0.55);
            c.g.lineStyle(1.1, CYAN, 0.75);
            c.g.lineBetween(left.x + 0.8, left.y, right.x - 0.8, right.y);
            c.g.lineStyle(0.8, 0xbff4ff, 0.18);
            c.g.lineBetween(left.x, left.y - 2.2, right.x, right.y - 2.2);
        },
    });
    // Panel seams on the pale band above the glass.
    for (let k = 0; k < 8; k++) {
        const angle = spin + (k * Math.PI) / 4;
        const [px, py] = [10 * Math.cos(angle + Math.PI / 8), 10 * Math.sin(angle + Math.PI / 8)];
        if (py < 0) continue;
        c.line([px, py, z0 + 17.5], [px, py, z1], 0.7, 0x8e9aa4, 0.7);
    }
    // A status light on the front.
    glowDot(c, 0, 10.4, z0 + 19.5, 0x4cf2a0, 0.6);
}

/** The roof: a flared solar canopy with a bright rim, over a sensor dome and mast, with a team flag. */
function canopy(c: Canvas3D, teamColor: number): void {
    const base = Z + LEG_HEIGHT + 24;
    const spin = Math.PI / 8;
    c.loft(ring(0, 0, 10, 8, spin), ring(0, 0, 15, 8, spin), base, base + 3, 0x2b343b, {
        top: null,
    });
    c.loft(ring(0, 0, 15.5, 8, spin), ring(0, 0, 15.5, 8, spin), base + 3, base + 4.2, 0x1c2d4a, {
        top: 0x203a63,
    });
    // Panel lines on the solar top, and its lit rim.
    const rim = ring(0, 0, 15.5, 8, spin).map((q) => c.p(q.x, q.y, base + 4.2));
    for (const q of ring(0, 0, 15.5, 8, spin))
        c.line([0, 0, base + 4.2], [q.x, q.y, base + 4.2], 0.6, 0x6f8fb8, 0.7);
    c.g.lineStyle(0.7, 0x6f8fb8, 0.7);
    c.g.strokePoints(
        ring(0, 0, 8, 8, spin).map((q) => c.p(q.x, q.y, base + 4.2)),
        true
    );
    c.g.lineStyle(1.6, CYAN, 0.9);
    c.g.strokePoints(
        rim.filter((_, i) => i >= 1 && i <= 4),
        false
    );
    // The sensor dome and mast.
    c.cylinder(0, 0, 4.2, 3.4, base + 4.2, base + 6.5, 0xdfe5e9, { top: null }, 12);
    c.cylinder(0, 0, 3.4, 1.2, base + 6.5, base + 9.5, 0xf2f5f7, { top: 0xffffff }, 12);
    c.line([0, 0, base + 9.5], [0, 0, base + 20], 0.9, 0x6f7b85);
    glowDot(c, 0, 0, base + 20.4, HOT_RED, 0.7);
    c.line([0, 0, base + 16], [3.4, 0, base + 18.4], 0.8, 0x6f7b85);
    drawFlag(c, -12, -6, base + 4.2, 12, teamColor);
}

/** A glass rail round the front and sides of the deck, lit along its top. */
function glassRail(c: Canvas3D): void {
    const [hx, hy, z0] = [13, 10, Z + LEG_HEIGHT + 2.4];
    const h = 6;
    c.poly(
        [
            [-hx, hy, z0],
            [hx, hy, z0],
            [hx, hy, z0 + h],
            [-hx, hy, z0 + h],
        ],
        0x8fe6f5,
        0.14
    );
    c.poly(
        [
            [hx, hy, z0],
            [hx, -hy, z0],
            [hx, -hy, z0 + h],
            [hx, hy, z0 + h],
        ],
        0x8fe6f5,
        0.12
    );
    c.poly(
        [
            [-hx, hy, z0],
            [-hx, -hy, z0],
            [-hx, -hy, z0 + h],
            [-hx, hy, z0 + h],
        ],
        0x8fe6f5,
        0.12
    );
    for (const [x, y] of [
        [-hx, hy],
        [0, hy],
        [hx, hy],
        [hx, 0],
        [hx, -hy],
        [-hx, 0],
        [-hx, -hy],
    ] as const) {
        c.line([x, y, z0], [x, y, z0 + h], 0.8, 0x9fb0bb);
    }
    glowLine(c, [-hx, hy, z0 + h], [hx, hy, z0 + h], CYAN, 0.8, 0.8);
    c.line([hx, hy, z0 + h], [hx, -hy, z0 + h], 0.8, 0x9fb0bb);
    c.line([-hx, hy, z0 + h], [-hx, -hy, z0 + h], 0.8, 0x9fb0bb);
}

/** The automated gun on a gimbal at the front right: a faceted housing and two glowing rail barrels. */
function gun(c: Canvas3D): void {
    const [x, y, z0] = [8.5, 10.4, Z + LEG_HEIGHT + 2.4];
    c.cylinder(x, y, 2.6, 2.6, z0, z0 + 2.4, 0x1f262b, { top: 0x39444c }, 8);
    c.cylinder(x, y, 3.3, 3.3, z0 + 2.4, z0 + 6.2, 0xd6dde2, { top: 0xf2f5f7 }, 6);
    c.cylinder(x, y, 3.4, 3.4, z0 + 4.4, z0 + 5, 0x2b343b, { top: null }, 6);
    // Two rail barrels, pointing out past the front, with glowing coils along them.
    for (const dx of [-1, 1.1]) {
        const from: V3 = [x + dx * 0.8, y + 1, z0 + 4.4];
        const to: V3 = [x + dx * 0.8 + 4.2, y + 14, z0 + 3.4];
        c.line(from, to, 2.2, 0x1b2126);
        c.line(from, to, 1, 0x8e9aa4);
        for (const t of [0.35, 0.6, 0.85]) {
            glowDot(
                c,
                from[0] + (to[0] - from[0]) * t,
                from[1] + (to[1] - from[1]) * t,
                from[2] + (to[2] - from[2]) * t,
                CYAN,
                0.55
            );
        }
        const muzzle = c.p(...to);
        c.g.fillStyle(0x0e1215, 1);
        c.g.fillCircle(muzzle.x, muzzle.y, 1.2);
    }
    // The sensor eye.
    glowDot(c, x + 1.6, y + 3.2, z0 + 5.4, HOT_RED, 0.7);
}
