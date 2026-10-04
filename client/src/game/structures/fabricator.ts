// The Fabricator: a fabrication hub from 2078. A low, wide block of dark gunmetal panels with a
// glowing bay at its front, a slanted solar roof carrying radiator fins, a dish and a mast,
// capacitor banks and a transformer on the side, and a robot arm on the lot. It is all electronic
// and sleek but well used: grime at the base, rust and oil streaks, scuffed panels, a few lamps out.

import { Canvas3D, seededRandom, shadeColor, type V3 } from './canvas';
import {
    AMBER,
    CYAN,
    HOT_RED,
    PAD_HEIGHT,
    drawFlag,
    SEVEN_HEX_CENTERS,
    drawHexPad,
    glowDot,
    glowLine,
    pipe,
} from './common';

const Z = PAD_HEIGHT;
const GUNMETAL = 0x3c444d;
const PLATE = 0x545f69; // lighter panel edges
const SOLAR = 0x233349;
const ORANGE = 0xe0832b; // safety orange: the arm, hazard stripes

// The hub, and its roof, which slopes up toward the back so it shows to the viewer.
const HUB = { x0: -42, x1: 16, y0: -8, y1: 14, wall: 25, rise: 5 };

/** Height of the hub's roof above the ground at depth y. */
const roofAt = (y: number) => Z + HUB.wall + (HUB.rise * (HUB.y1 - y)) / (HUB.y1 - HUB.y0);

export function drawFabricator(c: Canvas3D, teamColor: number): void {
    const random = seededRandom(0xfab1);
    drawHexPad(c, SEVEN_HEX_CENTERS, teamColor, 22);
    c.disc(-6, 24, Z, 10, 0x25282b, 0.5); // an oil stain in front of the bay
    c.disc(30, 28, Z, 6, 0x25282b, 0.35);
    hub(c, random, teamColor);
    capacitors(c);
    transformer(c, random);
    robotArm(c);
    cargo(c);
}

function hub(c: Canvas3D, random: () => number, teamColor: number): void {
    const { x0, x1, y0, y1, wall } = HUB;
    // The slanted roof first: dark solar panels in a grid, with a glint and a lit front edge.
    const front = Z + wall;
    const roof: V3[] = [
        [x0 - 1, y1 + 1, front],
        [x1 + 1, y1 + 1, front],
        [x1 + 1, y0, roofAt(y0)],
        [x0 - 1, y0, roofAt(y0)],
    ];
    c.poly(roof, SOLAR, 1, { width: 1, color: 0x6f8199 });
    const at = (s: number, t: number): V3 => [
        x0 + s * (x1 - x0),
        y1 + t * (y0 - y1),
        front + t * HUB.rise,
    ];
    for (let k = 1; k < 8; k++) c.line(at(k / 8, 0), at(k / 8, 1), 0.6, 0x4e6483, 0.9);
    for (let k = 1; k < 3; k++) c.line(at(0, k / 3), at(1, k / 3), 0.6, 0x4e6483, 0.9);
    c.poly([at(0.08, 0.1), at(0.2, 0.1), at(0.3, 0.9), at(0.18, 0.9)], 0xa9c3e0, 0.16);
    c.poly([at(0.52, 0.1), at(0.6, 0.1), at(0.68, 0.9), at(0.6, 0.9)], 0xa9c3e0, 0.1);
    roofGear(c, random, teamColor);

    // The front wall: gunmetal panels, seams with a lit edge, grime, a glowing strip under the roof.
    const wallQuad = c.frontWall(x0, x1, y1, Z, front, GUNMETAL);
    for (let k = 1; k < 8; k++) {
        const x = x0 + (k * (x1 - x0)) / 8;
        c.line([x, y1, Z], [x, y1, front], 0.9, 0x1e2429, 0.85);
        c.line([x + 0.8, y1, Z], [x + 0.8, y1, front], 0.5, PLATE, 0.55);
    }
    for (const z of [Z + 8, Z + 16]) {
        c.line([x0, y1, z], [x1, y1, z], 0.9, 0x1e2429, 0.85);
        c.line([x0, y1, z + 0.8], [x1, y1, z + 0.8], 0.5, PLATE, 0.5);
    }
    // Weathering: grime climbing from the ground, streaks, scuffs, a rusty patch.
    for (const [height, alpha] of [
        [2, 0.5],
        [4, 0.3],
        [6.5, 0.18],
    ] as const) {
        c.poly(
            [
                [x0, y1, Z],
                [x1, y1, Z],
                [x1, y1, Z + height],
                [x0, y1, Z + height],
            ],
            0x0f1316,
            alpha
        );
    }
    for (let k = 0; k < 12; k++) {
        const x = x0 + 2 + random() * (x1 - x0 - 4);
        const top = Z + 10 + random() * 12;
        c.line(
            [x, y1, top],
            [x, y1, top - 4 - random() * 9],
            1.1,
            random() < 0.3 ? 0x7a4a2a : 0x0e1215,
            0.28
        );
    }
    c.poly(
        [
            [x0 + 3, y1, Z + 9],
            [x0 + 12, y1, Z + 9],
            [x0 + 11, y1, Z + 14],
            [x0 + 4, y1, Z + 14.5],
        ],
        0x6b4328,
        0.28
    );
    c.speckle(wallQuad, random, 200, [0x1b2025, 0x7d8892], 0.3);
    glowLine(c, [x0 + 1, y1, front - 2.2], [x1 - 1, y1, front - 2.2], teamColor, 1.2, 0.95);
    // A few lamps along the base, one dead and one red.
    for (let x = x0 + 5; x < x1; x += 7) {
        const roll = random();
        if (roll < 0.2) continue;
        glowDot(c, x, y1, Z + 3.6, roll < 0.3 ? HOT_RED : CYAN, 0.5);
    }

    bay(c);
    slits(c);
}

/** The fabrication bay: a dark opening in a lit frame, with amber scan lines and a part on the floor. */
function bay(c: Canvas3D): void {
    const [x0, x1, y, h] = [-15, 8, HUB.y1, 17];
    const cut = 3;
    const frame: V3[] = [
        [x0, y, Z],
        [x1, y, Z],
        [x1, y, Z + h - cut],
        [x1 - cut, y, Z + h],
        [x0 + cut, y, Z + h],
        [x0, y, Z + h - cut],
    ];
    c.poly(frame, 0x0b1217);
    // Light spilling out: scan lines, brighter toward the floor.
    for (let z = Z + 1.5; z < Z + h - 2; z += 1.8) {
        c.line([x0 + 1, y, z], [x1 - 1, y, z], 0.6, AMBER, 0.1 + 0.28 * (1 - (z - Z) / h));
    }
    // A part being made: a bright block with a beam above it.
    c.poly(
        [
            [-8, y, Z],
            [1, y, Z],
            [1, y, Z + 5],
            [-8, y, Z + 5],
        ],
        0x1a2833,
        1,
        { width: 0.8, color: AMBER, alpha: 0.9 }
    );
    glowLine(c, [-3.5, y, Z + 5], [-3.5, y, Z + h - 4], AMBER, 0.8, 0.7);
    // The lit frame.
    for (let i = 0; i < frame.length; i++)
        glowLine(c, frame[i], frame[(i + 1) % frame.length], CYAN, 1.1, 0.9);
    for (const x of [-12, 5]) c.line([x, y + 0.2, Z + 1], [x, y + 0.2, Z + 6], 2, ORANGE);
}

/** Narrow lit slits on the wall, some dead. */
function slits(c: Canvas3D): void {
    const y = HUB.y1;
    for (const [x, on] of [
        [-38, true],
        [-34, true],
        [-30, false],
        [-26, true],
        [-21, true],
        [12, true],
        [14.5, false],
    ] as const) {
        c.poly(
            [
                [x, y, Z + 10],
                [x + 1.4, y, Z + 10],
                [x + 1.4, y, Z + 20],
                [x, y, Z + 20],
            ],
            0x10181d
        );
        if (on) glowLine(c, [x + 0.7, y, Z + 11], [x + 0.7, y, Z + 19], CYAN, 0.9, 0.85);
    }
}

/** What stands on the roof: radiator fins, a dish, a mast with a blinking light, a flag. */
function roofGear(c: Canvas3D, random: () => number, teamColor: number): void {
    // Radiator fins.
    const fz = roofAt(-4);
    c.box(-38, -22, -7, 2, fz, fz + 5, 0x2a3138, { top: 0x39424b });
    for (let x = -37; x < -22; x += 1.8) c.line([x, 2, fz], [x, 2, fz + 5], 0.7, 0x687682, 0.8);
    glowLine(c, [-38, 2, fz + 5.3], [-22, 2, fz + 5.3], AMBER, 0.7, 0.6);
    // A dish on a short mast.
    const dz = roofAt(-6);
    c.line([6, -6, dz], [6, -6, dz + 7], 1.4, 0x58626b);
    c.disc(6, -6, dz + 8, 5.5, 0xcfd6dc);
    c.disc(6, -6, dz + 8.4, 3.6, 0x8a959e);
    c.line([6, -6, dz + 8], [9, -3, dz + 12], 0.8, 0x58626b);
    glowDot(c, 9, -3, dz + 12.5, CYAN, 0.6);
    // A tall mast with a red light.
    const mz = roofAt(-7);
    c.line([-12, -6, mz], [-12, -6, mz + 26], 1.2, 0x6a757e);
    c.line([-12, -6, mz + 20], [-9, -6, mz + 20], 0.8, 0x6a757e);
    glowDot(c, -12, -6, mz + 26.5, HOT_RED, 0.8);
    void random;
    drawFlag(c, 12, -2, roofAt(-2), 14, teamColor);
}

/** Two capacitor banks of three glowing cylinders, joined to the hub by heavy conduits. */
function capacitors(c: Canvas3D): void {
    for (const [x, h] of [
        [24, 20],
        [31, 26],
        [38, 20],
    ] as const) {
        c.cylinder(x, -2, 3.8, 3.8, Z, Z + h, 0x2f373e, { top: null }, 14);
        c.cylinder(x, -2, 3.8, 3, Z + h, Z + h + 2, 0x59646d, { top: 0x7d8993 }, 14);
        for (const z of [5, 11, 17].filter((q) => q < h - 2)) {
            c.cylinder(x, -2, 4.1, 4.1, Z + z, Z + z + 1.3, CYAN, { top: null }, 14);
        }
        c.line([x - 2.2, 1, Z + 2], [x - 2.2, 1, Z + h - 2], 0.9, 0x7d8993, 0.6);
        // Grime at the foot.
        c.cylinder(x, -2, 3.9, 3.9, Z, Z + 2.5, 0x14181b, { top: null, alpha: 0.5 }, 14);
    }
    pipe(
        c,
        [
            [HUB.x1, -2, Z + 11],
            [20, -2, Z + 11],
        ],
        { width: 3.6, dark: 0x2d343a, light: 0x7d8993 }
    );
    pipe(
        c,
        [
            [27.5, -2, Z + 8],
            [27.5, -2, Z + 8],
            [35, -2, Z + 8],
        ],
        { width: 2.6, dark: 0x2d343a, light: 0x7d8993 }
    );
}

/** A transformer box with hazard stripes, vents and status lights. */
function transformer(c: Canvas3D, random: () => number): void {
    const [x0, x1, y0, y1, h] = [22, 44, 11, 25, 9];
    c.box(x0, x1, y0, y1, Z, Z + h, 0x48525b, { top: 0x626e78 });
    const front = [c.p(x0, y1, Z + h), c.p(x1, y1, Z + h), c.p(x1, y1, Z), c.p(x0, y1, Z)];
    c.poly(
        [
            [x0, y1, Z],
            [x1, y1, Z],
            [x1, y1, Z + 2],
            [x0, y1, Z + 2],
        ],
        0x14181b,
        0.5
    );
    for (let x = x0; x < x1 - 3; x += 6) {
        c.poly(
            [
                [x, y1, Z + 2],
                [x + 3, y1, Z + 2],
                [x + 4.5, y1, Z + 5],
                [x + 1.5, y1, Z + 5],
            ],
            ORANGE
        );
    }
    for (let z = Z + 6; z < Z + h - 0.5; z += 1.3)
        c.line([x0 + 14, y1, z], [x1 - 1.5, y1, z], 0.6, 0x20272c, 0.9);
    c.speckle(front, random, 60, [0x20272c, 0x9aa5ae], 0.3);
    glowDot(c, x0 + 3, y1, Z + 6.6, 0x4cf2a0, 0.6);
    glowDot(c, x0 + 6, y1, Z + 6.6, AMBER, 0.6);
    glowDot(c, x0 + 9, y1, Z + 6.6, HOT_RED, 0.6);
}

/** A robot arm on the lot: an orange base, two links and a gripper. */
function robotArm(c: Canvas3D): void {
    const [x, y] = [-37, 26];
    c.cylinder(x, y, 3.4, 3.4, Z, Z + 3, 0x30383f, { top: 0x4d5760 }, 10);
    c.cylinder(x, y, 2.4, 2.4, Z + 3, Z + 6, ORANGE, { top: shadeColor(ORANGE, 1.1) }, 10);
    const shoulder: V3 = [x, y, Z + 6];
    const elbow: V3 = [x + 7, y - 3, Z + 19];
    const wrist: V3 = [x + 15, y + 2, Z + 14];
    for (const [a, b, w] of [
        [shoulder, elbow, 3.2],
        [elbow, wrist, 2.6],
    ] as const) {
        c.line(a, b, w + 1.2, 0x2a1d10);
        c.line(a, b, w, ORANGE);
        c.line(a, b, w * 0.3, 0xffc27a, 0.7);
    }
    for (const j of [shoulder, elbow, wrist]) {
        const at = c.p(...j);
        c.g.fillStyle(0x2b333a, 1);
        c.g.fillCircle(at.x, at.y, 2.1);
        c.g.fillStyle(0x7d8993, 1);
        c.g.fillCircle(at.x, at.y, 0.9);
    }
    c.line(wrist, [wrist[0] + 1.6, wrist[1] + 1, wrist[2] - 4], 1, 0x9aa5ae);
    c.line(wrist, [wrist[0] - 1.6, wrist[1] + 1, wrist[2] - 4], 1, 0x9aa5ae);
    glowDot(c, wrist[0], wrist[1], wrist[2] - 4.5, CYAN, 0.6);
}

/** Cargo pods and coolant canisters by the arm. */
function cargo(c: Canvas3D): void {
    c.box(-43, -34, 19, 28, Z, Z + 6, 0x37424a, {
        face: (quad) => {
            c.g.lineStyle(0.8, 0x151a1e, 0.9);
            c.g.lineBetween(quad[0].x, quad[0].y, quad[2].x, quad[2].y);
            c.g.lineBetween(quad[1].x, quad[1].y, quad[3].x, quad[3].y);
        },
    });
    c.box(-41, -36, 20, 24, Z + 6, Z + 9, 0x2d363d);
    glowLine(c, [-42, 28, Z + 3], [-35, 28, Z + 3], CYAN, 0.8, 0.7);
    for (const [x, y] of [
        [-12, 27],
        [-8, 29],
    ] as const) {
        c.cylinder(x, y, 2.4, 2.4, Z, Z + 6.5, 0x59646d, { top: 0x7d8993 }, 10);
        c.cylinder(x, y, 2.5, 2.5, Z + 4, Z + 5.4, CYAN, { top: null }, 10);
    }
}
