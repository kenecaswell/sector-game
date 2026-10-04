// The Power plant: a geothermal plant from 2078. Tall brushed-stainless vessels ringed with
// catwalks, linked by insulated pipes, beside a wide condenser tank and a bank of short condensers;
// wellheads with cyan valve lights feed it, a sleek white control module stands at the front, and
// two thin dark stacks pour dark brown smoke (animated by the scene: see `smokeSources`). Cyan
// strips and rings glow on everything, and sulfur-yellow crust stains the lot around the wellheads.

import type { Pt } from './canvas';
import { Canvas3D, seededRandom } from './canvas';
import {
    CYAN,
    AMBER,
    PAD_HEIGHT,
    SEVEN_HEX_CENTERS,
    drawFlag,
    drawHexPad,
    glowDot,
    glowLine,
    pipe,
} from './common';

const Z = PAD_HEIGHT;
const STEEL = 0xc9d0d6; // brushed stainless
const STEEL_DARK = 0x8c97a0;
const GRAPHITE = 0x343c43;

const VESSELS = [
    { x: -27, y: -13, r: 6.2, h: 48 },
    { x: -13, y: -13, r: 6.2, h: 42 },
    { x: 1, y: -13, r: 6.2, h: 46 },
];
const TANK = { x: 20, y: -9, r: 8.6, h: 32 };
const STACKS = [
    { x: 36, y: -21, height: 66, r0: 2.4, r1: 1.9 },
    { x: 42, y: -17, height: 58, r0: 2.2, r1: 1.8 },
];

/** Where the smoke leaves the stacks, in screen px from the structure's middle on the ground. */
export function powerSmokeSources(): Pt[] {
    return STACKS.map((s) => ({ x: s.x, y: s.y * 0.6 - (Z + s.height) }));
}

export function drawPowerPlant(c: Canvas3D, teamColor: number): void {
    const random = seededRandom(0x90e4);
    drawHexPad(c, SEVEN_HEX_CENTERS, teamColor, 33);
    // Mineral stains around the wellheads: sulfur yellow, with a pale crust.
    c.disc(31, 21, Z, 11, 0xd2ae3c, 0.3);
    c.disc(40, 14, Z, 7, 0xc9a43a, 0.3);
    c.disc(30, 22, Z, 6, 0xeee6c4, 0.35);
    c.disc(-4, 27, Z, 8, 0x3a3d40, 0.4);
    stacks(c);
    // Back to front: the catwalks' far halves, the vessels, their near halves, the tank, the pipes,
    // then the low things in front.
    for (const v of VESSELS) catwalk(c, v.x, v.y, v.r, 26, false);
    for (const v of VESSELS) vessel(c, v, random);
    for (const v of VESSELS) catwalk(c, v.x, v.y, v.r, 26, true);
    tank(c, teamColor);
    linkPipes(c);
    condenserBank(c);
    wellhead(c, 27, 21);
    wellhead(c, 38, 13);
    wellPipes(c);
    controlModule(c, random, teamColor);
}

/** Two thin dark stacks with a glowing ring near the top. */
function stacks(c: Canvas3D): void {
    for (const { x, y, height, r0, r1 } of STACKS) {
        const radius = (up: number) => r0 + (r1 - r0) * (up / height);
        c.cylinder(
            x,
            y,
            r0,
            radius(height * 0.84),
            Z,
            Z + height * 0.84,
            0x3d474f,
            { top: null },
            12
        );
        // A bright ring, then the mouth.
        c.cylinder(
            x,
            y,
            radius(height * 0.84) + 0.5,
            radius(height * 0.9) + 0.5,
            Z + height * 0.84,
            Z + height * 0.9,
            0x8be9f7,
            { top: null },
            12
        );
        c.cylinder(
            x,
            y,
            radius(height * 0.9),
            r1,
            Z + height * 0.9,
            Z + height,
            0x3d474f,
            { top: null },
            12
        );
        c.cylinder(
            x,
            y,
            r1 + 0.6,
            r1 + 0.6,
            Z + height - 1.2,
            Z + height,
            0x1f2428,
            { top: 0x0d0f10 },
            12
        );
        c.line(
            [x - r0 * 0.5, y + r0 * 0.8, Z + 2],
            [x - r1 * 0.5, y + r1 * 0.8, Z + height * 0.8],
            0.8,
            0x9aa6ae,
            0.7
        );
        glowLine(
            c,
            [x + r0 * 0.5, y + r0 * 0.85, Z + height * 0.55],
            [x + r1 * 0.5, y + r1 * 0.85, Z + height * 0.78],
            CYAN,
            0.6,
            0.6
        );
    }
}

/** A tall brushed-stainless vessel: banded, domed, with a glowing seam and a highlight. */
function vessel(
    c: Canvas3D,
    { x, y, r, h }: { x: number; y: number; r: number; h: number },
    random: () => number
): void {
    c.cylinder(x, y, r, r, Z, Z + h, STEEL, { top: null }, 20);
    for (const f of [0.14, 0.46, 0.78]) {
        c.cylinder(
            x,
            y,
            r + 0.45,
            r + 0.45,
            Z + f * h,
            Z + f * h + 1.5,
            STEEL_DARK,
            { top: null },
            20
        );
    }
    // Domed cap in two steps.
    c.cylinder(x, y, r, r * 0.62, Z + h, Z + h + 3.2, 0xdde3e7, { top: null }, 20);
    c.cylinder(x, y, r * 0.62, r * 0.2, Z + h + 3.2, Z + h + 6, 0xeef2f4, { top: 0xf6f9fa }, 20);
    // A highlight down the lit side, a seam of light on the other, and a few scuffs.
    c.line(
        [x - r * 0.62, y + r * 0.78, Z + 3],
        [x - r * 0.62, y + r * 0.78, Z + h - 2],
        1.1,
        0xf4f7f9,
        0.55
    );
    glowLine(
        c,
        [x + r * 0.55, y + r * 0.83, Z + 6],
        [x + r * 0.55, y + r * 0.83, Z + h - 6],
        CYAN,
        1.1,
        0.9
    );
    for (let k = 0; k < 4; k++) {
        const z = Z + 4 + random() * (h - 8);
        c.line(
            [x - r * 0.3, y + r * 0.95, z],
            [x - r * 0.3, y + r * 0.95, z + 2 + random() * 4],
            0.9,
            0x6c767f,
            0.25
        );
    }
    // A ladder cage up the back-left, seen past the edge.
    c.line([x - r * 0.95, y + r * 0.3, Z], [x - r * 0.95, y + r * 0.3, Z + h * 0.6], 0.9, 0x66707a);
}

/** A catwalk ring round a vessel: drawn in two halves so the vessel passes through it. */
function catwalk(c: Canvas3D, x: number, y: number, r: number, up: number, front: boolean): void {
    const z = Z + up;
    const arc = (radius: number, height: number, width: number, color: number, alpha = 1) => {
        const points = [];
        for (let k = 0; k <= 24; k++) {
            const angle = front ? (k / 24) * Math.PI : Math.PI + (k / 24) * Math.PI;
            points.push(c.p(x + radius * Math.cos(angle), y + radius * Math.sin(angle), height));
        }
        c.g.lineStyle(width, color, alpha);
        c.g.strokePoints(points, false);
    };
    arc(r + 3, z, 3.4, 0x3a434b);
    arc(r + 3, z + 0.9, 1.4, 0x6f7b85);
    if (front) {
        arc(r + 3.4, z + 5.5, 1, 0xc9d0d6, 0.9);
        arc(r + 3.4, z + 5.9, 0.8, CYAN, 0.8);
        for (let k = 0; k <= 4; k++) {
            const angle = (k / 4) * Math.PI;
            const [px, py] = [x + (r + 3.4) * Math.cos(angle), y + (r + 3.4) * Math.sin(angle)];
            c.line([px, py, z], [px, py, z + 5.8], 0.8, 0x9aa6ae);
        }
    }
}

/** The wide condenser tank on the right, with a glowing band and a team-colored ring. */
function tank(c: Canvas3D, teamColor: number): void {
    const { x, y, r, h } = TANK;
    c.cylinder(x, y, r, r, Z, Z + h, STEEL, { top: null }, 24);
    for (const f of [0.2, 0.8])
        c.cylinder(
            x,
            y,
            r + 0.4,
            r + 0.4,
            Z + f * h,
            Z + f * h + 1.4,
            STEEL_DARK,
            { top: null },
            24
        );
    c.cylinder(
        x,
        y,
        r + 0.3,
        r + 0.3,
        Z + h * 0.45,
        Z + h * 0.45 + 3.2,
        teamColor,
        { top: null },
        24
    );
    c.cylinder(x, y, r, r * 0.55, Z + h, Z + h + 4.5, 0xdde3e7, { top: 0xf0f4f6 }, 24);
    c.line(
        [x - r * 0.66, y + r * 0.75, Z + 3],
        [x - r * 0.66, y + r * 0.75, Z + h - 2],
        1.3,
        0xf4f7f9,
        0.5
    );
    glowLine(
        c,
        [x + r * 0.6, y + r * 0.8, Z + 5],
        [x + r * 0.6, y + r * 0.8, Z + h * 0.4],
        CYAN,
        1.1,
        0.85
    );
    glowLine(
        c,
        [x + r * 0.6, y + r * 0.8, Z + h * 0.62],
        [x + r * 0.6, y + r * 0.8, Z + h - 4],
        CYAN,
        1.1,
        0.85
    );
    // A small service platform with a railing on the front.
    c.box(x - 4, x + 4, y + r - 0.5, y + r + 3, Z + 12, Z + 13, 0x4a545c, { top: 0x6f7b85 });
    c.line([x - 4, y + r + 3, Z + 17], [x + 4, y + r + 3, Z + 17], 0.9, 0xc9d0d6);
    glowDot(c, x - 4, y + r + 3, Z + 17.5, CYAN, 0.7);
    glowDot(c, x + 4, y + r + 3, Z + 17.5, CYAN, 0.7);
}

/** Insulated pipes running along the front of the vessels and on to the tank. */
function linkPipes(c: Canvas3D): void {
    pipe(
        c,
        [
            [-27, -6.6, Z + 15],
            [1, -6.6, Z + 15],
            [12, -3, Z + 15],
            [14, -3, Z + 15],
        ],
        { width: 4.2 }
    );
    pipe(
        c,
        [
            [-20, -6.6, Z + 15],
            [-20, -6.6, Z + 3],
        ],
        { width: 3.4 }
    );
    pipe(
        c,
        [
            [-6, -6.6, Z + 15],
            [-6, -6.6, Z + 3],
        ],
        { width: 3.4 }
    );
    pipe(
        c,
        [
            [7, -13, Z + 36],
            [11.5, -11, Z + 36],
            [12.5, -11, Z + 36],
        ],
        { width: 3.4 }
    );
}

/** A bank of four short stainless condensers, each with a glowing cap. */
function condenserBank(c: Canvas3D): void {
    for (const x of [-12, -5, 2, 9]) {
        c.cylinder(x, 12, 3.3, 3.3, Z, Z + 13, STEEL, { top: null }, 14);
        c.cylinder(x, 12, 3.3, 2.2, Z + 13, Z + 15, 0xe2e7ea, { top: 0xf3f6f8 }, 14);
        c.cylinder(x, 12, 3.6, 3.6, Z + 6, Z + 7.2, STEEL_DARK, { top: null }, 14);
        glowLine(c, [x + 1.6, 14.7, Z + 2], [x + 1.6, 14.7, Z + 11], CYAN, 0.9, 0.85);
        c.line([x - 1.7, 14.4, Z + 1.5], [x - 1.7, 14.4, Z + 11], 0.9, 0xf4f7f9, 0.5);
    }
}

/** A wellhead: a dark steel stack with a glowing ring and a boxy valve actuator. */
function wellhead(c: Canvas3D, x: number, y: number): void {
    c.cylinder(x, y, 2.5, 2.5, Z, Z + 8, GRAPHITE, { top: 0x20262b }, 10);
    c.cylinder(x, y, 3.4, 3.4, Z + 1, Z + 2.2, 0x59636b, { top: 0x8a949b }, 10);
    glowLine(c, [x - 2.3, y + 1.2, Z + 5.2], [x + 2.3, y + 1.2, Z + 5.2], CYAN, 1, 0.9);
    c.box(x - 2, x + 2, y - 2, y + 2, Z + 8, Z + 11.5, 0xc4ccd2, { top: 0xe3e8eb });
    glowDot(c, x, y + 2.2, Z + 9.6, AMBER, 0.7);
}

function wellPipes(c: Canvas3D): void {
    // The near wellhead: over an expansion loop to the front of the tank.
    pipe(c, [
        [27, 21, Z + 8],
        [27, 21, Z + 14],
        [20, 21, Z + 14],
        [20, 14, Z + 14],
        [20, 14, Z + 23],
        [20, 8, Z + 23],
        [20, 8, Z + 14],
        [20, 0, Z + 14],
    ]);
    // The far one: along the back to the tank's right side.
    pipe(c, [
        [38, 13, Z + 8],
        [38, 13, Z + 12],
        [38, -8, Z + 12],
        [28.8, -8, Z + 12],
    ]);
}

/** The low white control module at the front left: seams, a long smoked window with cyan light. */
function controlModule(c: Canvas3D, random: () => number, teamColor: number): void {
    const [x0, x1, y0, y1, h] = [-43, -19, 2, 25, 11];
    c.box(x0, x1, y0, y1, Z, Z + h, 0xdfe5e9, { top: 0xf0f3f5 });
    const front = [c.p(x0, y1, Z + h), c.p(x1, y1, Z + h), c.p(x1, y1, Z), c.p(x0, y1, Z)];
    for (let x = x0 + 6; x < x1; x += 6) c.line([x, y1, Z], [x, y1, Z + h], 0.8, 0x8f9aa3, 0.5);
    c.poly(
        [
            [x0, y1, Z],
            [x1, y1, Z],
            [x1, y1, Z + 2.5],
            [x0, y1, Z + 2.5],
        ],
        0x4a535b,
        0.55
    );
    c.speckle(front, random, 70, [0x6a747c, 0xffffff], 0.25);
    // The long window and a team-colored light strip over it.
    c.poly(
        [
            [x0 + 2, y1, Z + 4.2],
            [x1 - 2, y1, Z + 4.2],
            [x1 - 2, y1, Z + 8.2],
            [x0 + 2, y1, Z + 8.2],
        ],
        0x14232b,
        1,
        { width: 1, color: 0x9aa6ae }
    );
    c.poly(
        [
            [x0 + 4, y1, Z + 7.4],
            [x0 + 12, y1, Z + 7.4],
            [x0 + 9, y1, Z + 4.8],
            [x0 + 4, y1, Z + 4.8],
        ],
        0x7fd9e8,
        0.3
    );
    glowLine(c, [x0 + 3, y1, Z + 9.6], [x1 - 3, y1, Z + 9.6], teamColor, 1.1, 0.95);
    for (let x = x0 + 5; x < x1 - 4; x += 5)
        glowDot(c, x, y1, Z + 6.2, random() < 0.2 ? AMBER : CYAN, 0.55);
    // A roof slab with a small mast and the team flag.
    c.box(x0 - 1, x1 + 1, y0 - 1, y1 + 1, Z + h, Z + h + 1.4, 0xb9c1c8, { top: 0xe9edf0 });
    // Solar panels and a vent on the roof.
    const roof = Z + h + 1.4;
    c.poly(
        [
            [-36, 8, roof],
            [-24, 8, roof],
            [-24, 18, roof],
            [-36, 18, roof],
        ],
        0x1f3556,
        1,
        { width: 0.8, color: 0x9fb4c8 }
    );
    for (const t of [0.33, 0.66]) {
        c.line([-36 + 12 * t, 8, roof], [-36 + 12 * t, 18, roof], 0.6, 0x7894b3, 0.8);
        c.line([-36, 8 + 10 * t, roof], [-24, 8 + 10 * t, roof], 0.6, 0x7894b3, 0.8);
    }
    c.cylinder(-27, 22, 2.2, 2.2, roof, roof + 2.5, 0x9aa6ae, { top: 0x3b444b }, 10);
    c.line([-24, 14, Z + h + 1.4], [-24, 14, Z + h + 9], 0.9, 0x6a747c);
    glowDot(c, -24, 14, Z + h + 9.5, 0xff4d3d, 0.7);
    drawFlag(c, -39, 8, Z + h + 1.4, 14, teamColor);
}
