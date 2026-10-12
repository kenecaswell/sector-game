// The five characters, each in a suit made for its job. A character is drawn in two layers, one rig
// each (see index.ts): `c.lo`, the legs, which face the way it is walking and swing through a stride,
// and `c.up`, everything above the hips, which faces the way it is aiming. All are posed in the rig's
// local frame (u right, v ahead, z up, px) standing at the origin; the three humanoids share a build
// and differ in suit, helmet, pack and what they carry. The Robot is its own machine.
//
// The suit itself (the trunk, arms and legs; the Robot's shell) is in the team's color, so teams can
// be told apart at a glance; helmets, packs, tools and trim keep each character's own colors.

import type { CharacterId } from '../../types/shared';
import { shadeColor, type V3 } from '../structures/canvas';
import { alongLeg, humanLeg, robotLeg, ANKLE_Z, type Leg, type Stride } from './gait';
import type { Rig } from './rig';

/** What a character is drawn onto: the legs' rig, the body's rig, how far it is through a stride. */
export interface Cast {
    lo: Rig;
    up: Rig;
    stride: Stride;
    /** The team color (0xRRGGBB) the suit is drawn in; each character's own color if left out. */
    team?: number;
    /** Whether the legs wear shin guards (Armor level 3). */
    shins?: boolean;
}

/** Where the upgrades bolt on: the body's measurements, in the rig's local frame. */
export interface Anchors {
    /** The trunk: half-width, half-depth and the heights it spans. */
    torso: { u: number; v: number; z0: number; z1: number };
    /** The shoulders' sideways distance and height (the middle of the side of the trunk for the Robot). */
    shoulder: { u: number; z: number };
    /** The helmet, or null for a body with no head. */
    head: { z: number; ru: number; rv: number; rz: number } | null;
    /** The plane of the back (v) and the height of a pack's middle. */
    back: { v: number; z: number };
}

export const HUMAN_ANCHORS: Anchors = {
    torso: { u: 6.6, v: 4.3, z0: 20.5, z1: 31 },
    shoulder: { u: 7.9, z: 29.3 },
    head: { z: 37.5, ru: 7.4, rv: 7.8, rz: 7.6 },
    back: { v: -4.3, z: 25 },
};

export const ROBOT_ANCHORS: Anchors = {
    torso: { u: 9.5, v: 9.5, z0: 14, z1: 30 },
    shoulder: { u: 9.5, z: 24 },
    head: null,
    back: { v: -9.5, z: 22 },
};

export const ANCHORS: Record<CharacterId, Anchors> = {
    farmer: HUMAN_ANCHORS,
    scientist: HUMAN_ANCHORS,
    explorer: HUMAN_ANCHORS,
    engineer: HUMAN_ANCHORS,
    robot: ROBOT_ANCHORS,
};

interface Hands {
    left: [number, number, number];
    right: [number, number, number];
}

interface Suit {
    suit: number;
    panel: number; // darker panels: hips, collar, sleeve cuffs
    trim: number;
    boots: number;
    gloves: number;
}

/** `suit` with the team's color in place of its own: the main color, and a darker one for panels. */
function teamSuit(team: number | undefined, suit: Suit): Suit {
    return team === undefined ? suit : { ...suit, suit: team, panel: shadeColor(team, 0.72) };
}

/** A band of color around a leg: from `from` to `to` of the way up it (0 ankle, 0.5 knee, 1 hip). */
interface LegBand {
    from: number;
    to: number;
    color: number;
}

/**
 * The hips and both legs at this stride: a boot, shin and thigh with a knee pad, joined at the knee.
 * `bands` are stripes around the leg; `shins` adds shin guards (Armor 3).
 */
export function drawLegs(
    lo: Rig,
    s: Suit,
    stride: Stride,
    options: { bands?: LegBand[]; shins?: boolean } = {}
): void {
    lo.box(-5.4, 5.4, -3.6, 3.6, 16.5, 21.2, s.panel, { taper: 0.3 });
    for (const side of [-1, 1] as const) {
        const leg = humanLeg(stride, side);
        const { hip, knee, ankle } = leg;
        const lift = ankle[2] - ANKLE_Z;
        lo.box(
            ankle[0] - 2.8,
            ankle[0] + 2.8,
            ankle[1] - 3.4,
            ankle[1] + 6.2,
            lift,
            lift + 4.6,
            s.boots,
            {
                taper: 0.5,
            }
        );
        lo.tube([ankle[0], ankle[1] + 0.3, ankle[2] - 0.2], knee, 2.7, 2.9, s.suit);
        lo.tube(knee, hip, 3, 3.3, s.suit);
        lo.blob([knee[0], knee[1] + 2.2, knee[2]], 2.6, 1.6, 2.2, s.panel, { bands: 3, sides: 8 });
        for (const band of options.bands ?? []) legBand(lo, leg, band);
        if (options.shins) {
            lo.tube(ankle, alongLeg(leg, 0.62), 3.3, 3.4, 0x8e9aa6, { bias: 0.5 });
        }
    }
}

/** A stripe around a leg: a short, slightly fatter piece of it. */
function legBand(lo: Rig, leg: Leg, band: LegBand): void {
    const radius = band.from < 0.5 ? 3.1 : 3.4;
    lo.tube(alongLeg(leg, band.from), alongLeg(leg, band.to), radius, radius, band.color, {
        bias: 0.1,
    });
}

/** The trunk, neck and arms every humanoid has, the arms reaching to `hands`. */
function trunk(up: Rig, s: Suit, hands: Hands): void {
    up.box(-6.6, 6.6, -4.3, 4.3, 20.5, 31, s.suit, { taper: 0.9 });
    up.cyl(0, 0, 3.5, 3.4, 30.5, 33.2, s.panel);

    for (const side of [-1, 1] as const) {
        const hand = side < 0 ? hands.left : hands.right;
        const shoulder: V3 = [side * 7.9, 0, 28.6];
        const elbow: V3 = [
            (shoulder[0] + hand[0]) / 2 + side * 1.2,
            (shoulder[1] + hand[1]) / 2 - 1,
            (shoulder[2] + hand[2]) / 2 - 1.2,
        ];
        up.tube(shoulder, elbow, 2.7, 2.4, s.suit, { sides: 8 });
        up.tube(elbow, hand, 2.4, 2.2, s.suit, { sides: 8 });
        up.blob(elbow, 2.7, 2.7, 2.4, s.panel, { bands: 3, sides: 8, bias: 0.3 });
        up.blob(shoulder, 3.4, 3.4, 3.2, s.suit, { bands: 4, sides: 10, bias: 0.3 });
        up.blob([hand[0], hand[1], hand[2] - 0.6], 2.6, 2.6, 2.6, s.gloves, {
            bands: 3,
            sides: 8,
        });
    }
}

// --- Farmer ------------------------------------------------------------------------------------

export function drawFarmer(c: Cast): void {
    const up = c.up;
    const s: Suit = teamSuit(c.team, {
        suit: 0x667a3e,
        panel: 0x4a5a2c,
        trim: 0xc9a84a,
        boots: 0x6a4527,
        gloves: 0xb08a55,
    });
    const hands: Hands = { left: [-8.4, 3, 19.5], right: [8.4, 5, 20.5] };
    drawLegs(c.lo, s, c.stride, { shins: c.shins });
    trunk(up, s, hands);

    // Chest: a seed-pouch harness and a row of small pockets.
    up.plate(
        [
            [-5.4, 4.4, 24],
            [5.4, 4.4, 24],
            [5.4, 4.4, 21.6],
            [-5.4, 4.4, 21.6],
        ],
        [0, 1, 0],
        s.trim
    );
    for (const u of [-3.4, 0, 3.4]) {
        up.plate(
            [
                [u - 1.2, 4.5, 30],
                [u + 1.2, 4.5, 30],
                [u + 1.2, 4.5, 27],
                [u - 1.2, 4.5, 27],
            ],
            [0, 1, 0],
            s.panel
        );
    }

    // Helmet: a wide sun visor with an amber faceplate.
    up.blob([0, 0.3, 37.5], 7.4, 7.8, 7.6, 0x6f8445);
    up.blob([0, 4, 37.6], 5.6, 4.2, 4.6, 0xd39a2e, { floor: -0.2, bias: 0.4 });
    up.box(-8, 8, 3.4, 10.6, 40.4, 41.4, 0x4a5a2c, { taper: 2, bias: 0.6 });
    up.cyl(-4.4, -6.4, 1, 1, 42, 47, 0x4a5a2c, { sides: 6 }); // a little antenna
    up.glow([-4.4, -6.4, 47.2], 1.4, 0xe9d36a, 1, { bias: 0.8 });

    // Back: a sprayer tank (two green canisters) with a hose to the nozzle.
    up.box(-5.6, 5.6, -8.8, -4.2, 18.6, 31, 0x4a5a2c, { taper: 0.4 });
    for (const u of [-3.2, 3.2]) {
        up.cyl(u, -10.2, 2.9, 2.9, 19, 32, 0x7cc15a, { sides: 10 });
        up.cyl(u, -10.2, 3.1, 3.1, 24, 25.4, 0xd9e6a8, { sides: 10, bias: 0.2 });
        up.cyl(u, -10.2, 1.2, 1.2, 32, 33.6, 0x9aa5a8, { sides: 6, bias: 0.2 });
    }
    up.rod([3.2, -10.2, 33], [8, -6, 33.8], 0.7, 0x3d4a24);
    up.rod([8, -6, 33.8], [10.6, 0, 27], 0.7, 0x3d4a24);
    up.rod([10.6, 0, 27], [8.6, 3.2, 21.5], 0.7, 0x3d4a24);

    // The sprayer in the right hand: a green tank with a nozzle.
    up.rod([8.4, 3.4, 20.6], [8.6, 11, 21.6], 2.1, 0x7cc15a);
    up.rod([8.6, 11, 21.6], [8.7, 15.2, 21.8], 0.9, 0x9aa5a8);
    up.rod([8.5, 6.6, 21.2], [8.5, 7.8, 21.3], 2.4, 0xd9e6a8);
    // A hand trowel on the left hip.
    up.rod([-9.2, 1, 14.4], [-9.4, 5.4, 12.6], 0.9, 0xc9ced1);
}

const SUIT_WHITE = 0xe3ebf0; // the Scientist's pack and collar: gear, so not in the team color

// --- Scientist ---------------------------------------------------------------------------------

export function drawScientist(c: Cast): void {
    const up = c.up;
    const s: Suit = teamSuit(c.team, {
        suit: 0xe3ebf0,
        panel: 0xb6c6d2,
        trim: 0x45c4e8,
        boots: 0xcbd7df,
        gloves: 0x45c4e8,
    });
    const hands: Hands = { left: [-4.6, 7.2, 21.8], right: [4.6, 7.2, 21.8] };
    drawLegs(c.lo, s, c.stride, {
        bands: [{ from: 0.63, to: 0.74, color: s.trim }],
        shins: c.shins,
    });
    trunk(up, s, hands);

    // Chest: a status panel, and cyan stripes down the sleeves and legs.
    up.plate(
        [
            [-3.6, 4.4, 29],
            [3.6, 4.4, 29],
            [3.6, 4.4, 24.4],
            [-3.6, 4.4, 24.4],
        ],
        [0, 1, 0],
        0x2f5f78
    );
    for (const [u, c] of [
        [-2, 0x45c4e8],
        [0, 0xf0b840],
        [2, 0x6ee08c],
    ] as const) {
        up.glow([u, 4.7, 26.7], 0.7, c, 1, { bias: 0.5 });
    }
    for (const side of [-1, 1]) {
        up.cyl(side * 7.9, 0, 3.1, 3.1, 25.8, 27.2, s.trim, { bias: 0.1 });
    }

    // Helmet: a clear bubble over a face.
    up.blob([0, 0.8, 37.2], 5.9, 6, 6.4, 0xdcae82, { outline: false });
    up.blob([0, -0.4, 39.4], 6.1, 6.3, 5, 0x5a3b26, { floor: 0.3, outline: false, bias: 0.2 });
    if (up.front > 0.25) {
        for (const u of [-2.2, 2.2]) up.glow([u, 6.2, 36.6], 0.75, 0x2b2118, 1, { bias: 0.9 });
    }
    up.cyl(0, 0, [6, 6.3], [5.4, 5.6], 31.5, 34, SUIT_WHITE, { bias: 0.3 });
    up.blob([0, 0.4, 37.5], 7.8, 8.1, 8, 0xcdeaf5, { alpha: 0.16, bias: 4, rim: 0x9db8c6 });

    // Back: a life-support pack with a glowing display.
    up.box(-5.4, 5.4, -8.6, -4.2, 18.6, 31, SUIT_WHITE, { taper: 0.4 });
    up.plate(
        [
            [-3.6, -8.7, 29],
            [3.6, -8.7, 29],
            [3.6, -8.7, 21.4],
            [-3.6, -8.7, 21.4],
        ],
        [0, -1, 0],
        0x2f6f8a
    );
    up.plate(
        [
            [-2.8, -8.8, 27.8],
            [2.8, -8.8, 27.8],
            [2.8, -8.8, 22.6],
            [-2.8, -8.8, 22.6],
        ],
        [0, -1, 0],
        0x6adcf2,
        { bias: 0.8 }
    );
    up.cyl(-3.4, -6.6, 1.3, 1.3, 31, 34, 0xff7b6b, { sides: 6 });
    up.cyl(3.4, -6.6, 1.3, 1.3, 31, 34, 0x6adcf2, { sides: 6 });

    // A data tablet held at the chest, its screen turned toward the scientist.
    up.box(-4.4, 4.4, 6.2, 7.4, 20.4, 27.6, 0x39464f, { taper: 0.2 });
    up.plate(
        [
            [-3.7, 6.1, 27],
            [3.7, 6.1, 27],
            [3.7, 6.1, 21],
            [-3.7, 6.1, 21],
        ],
        [0, -1, 0],
        0x58d6f0,
        { bias: 0.8 }
    );
    up.plate(
        [
            [-3.7, 7.5, 27],
            [3.7, 7.5, 27],
            [3.7, 7.5, 21],
            [-3.7, 7.5, 21],
        ],
        [0, 1, 0],
        0x39464f,
        { bias: 0.8 }
    );
}

// --- Explorer ----------------------------------------------------------------------------------

export function drawExplorer(c: Cast): void {
    const up = c.up;
    const s: Suit = teamSuit(c.team, {
        suit: 0xd0592a,
        panel: 0x8c3a1c,
        trim: 0xf2c14e,
        boots: 0x6b3a22,
        gloves: 0x4a3328,
    });
    const hands: Hands = { left: [-8.4, 6.2, 22], right: [8.4, 2.6, 18.6] };
    drawLegs(c.lo, s, c.stride, { shins: c.shins });
    trunk(up, s, hands);

    // Chest: crossed harness straps and a pocket; heavy knee and elbow pads are on the legs and arms.
    for (const side of [-1, 1]) {
        up.plate(
            [
                [side * 1.2, 4.5, 30.6],
                [side * 3.4, 4.5, 30.6],
                [side * 1.6, 4.5, 21.6],
                [side * -0.6, 4.5, 21.6],
            ],
            [0, 1, 0],
            0x4a3328
        );
    }
    up.plate(
        [
            [-3.6, 4.5, 26],
            [-0.8, 4.5, 26],
            [-0.8, 4.5, 23],
            [-3.6, 4.5, 23],
        ],
        [0, 1, 0],
        s.trim,
        { bias: 0.8 }
    );

    // Helmet: a rounded shell, a dark visor, a headlamp.
    up.blob([0, 0.3, 37.5], 7.4, 7.8, 7.6, 0xe0743a);
    up.blob([0, 3.9, 37], 5.8, 4.4, 4.6, 0x1f3340, { floor: -0.2, bias: 0.4 });
    up.glow([-1.8, 7.3, 38.4], 1.1, 0x9ad4e8, 0.9, { bias: 1 });
    up.cyl(0, 6.3, 2.4, 2, 41.4, 43.4, 0x4a3328, { sides: 8, bias: 0.6 });
    up.glow([0, 8.4, 42.6], 1.7, 0xfff0a0, 1, { bias: 0.9 });
    for (const side of [-1, 1])
        up.blob([side * 7.4, 0, 37.5], 1.7, 2.6, 2.6, 0x4a3328, { bands: 3, sides: 8 });

    // Back: a big pack with a rolled tent and a coil of rope.
    up.box(-6.6, 6.6, -10.4, -4.2, 16, 31.5, 0x8c3a1c, { taper: 0.6 });
    up.box(-5.2, 5.2, -11.4, -10.4, 18.5, 28.5, 0xd0592a, { taper: 0.4 });
    up.rod([-6.6, -8.2, 34], [6.6, -8.2, 34], 3, 0xb9a27a);
    up.rod([-6.6, -8.2, 34], [-6.6, -8.2, 34.1], 3.1, 0x8a7a58, { outline: false, bias: 0.2 });
    up.rod([-3.2, -8.2, 31.6], [-3.2, -8.2, 36.6], 0.6, 0x4a3328, { bias: 0.4 });
    up.rod([3.2, -8.2, 31.6], [3.2, -8.2, 36.6], 0.6, 0x4a3328, { bias: 0.4 });
    up.cyl(7.3, -7.4, 2.4, 2.4, 20, 26, 0xc8b788, { sides: 9 });
    up.cyl(-7.3, -7.4, 2.2, 2.2, 18, 25, 0x9aa5a8, { sides: 9 });

    // A scanner in the left hand (a screen and an antenna); a pickaxe hangs from the right.
    up.box(-10.8, -6.2, 5, 9.4, 20, 23.6, 0x5a646c, { taper: 0.3 });
    up.plate(
        [
            [-10, 5.4, 23.6],
            [-7, 5.4, 23.6],
            [-7, 9, 23.6],
            [-10, 9, 23.6],
        ],
        [0, 0, 1],
        0x6adc8a,
        { bias: 0.8 }
    );
    up.rod([-10.2, 8.8, 23.6], [-10.6, 9.4, 29], 0.45, 0x9aa5a8);
    up.rod([9.2, 2.6, 16.6], [9.6, 6.4, 8.4], 0.8, 0x6b3a22);
    up.rod([8.6, 6.4, 9.6], [10.8, 6.6, 7.4], 1, 0xb7c0c6);
}

// --- Engineer ----------------------------------------------------------------------------------

export function drawEngineer(c: Cast): void {
    const up = c.up;
    const s: Suit = teamSuit(c.team, {
        suit: 0x3b4047,
        panel: 0x2a2d32,
        trim: 0xf0bc1c,
        boots: 0x24272b,
        gloves: 0x5d6168,
    });
    const hands: Hands = { left: [-8.4, 4.4, 19.6], right: [8.6, 3.4, 18.4] };
    drawLegs(c.lo, s, c.stride, {
        bands: [
            { from: 0.77, to: 0.9, color: s.trim },
            { from: 0.16, to: 0.27, color: s.trim },
        ],
        shins: c.shins,
    });
    trunk(up, s, hands);

    // Hazard bands on the sleeves (the legs have theirs); a yellow utility belt with pouches.
    for (const side of [-1, 1]) {
        up.cyl(side * 8.1, 0.4, 2.9, 2.9, 25.2, 26.6, s.trim, { bias: 0.15, sides: 8 });
    }
    up.cyl(0, 0, [6.6, 4.6], [6.6, 4.6], 19.4, 21.4, s.trim, { sides: 14, bias: 0.2 });
    for (const u of [-5.4, 5.4])
        up.box(u - 1.4, u + 1.4, -1.8, 2.4, 14.8, 19.4, 0x60646b, { taper: 0.3, bias: 0.6 });
    up.plate(
        [
            [-4.2, 4.4, 30],
            [4.2, 4.4, 30],
            [4.2, 4.4, 26.2],
            [-4.2, 4.4, 26.2],
        ],
        [0, 1, 0],
        s.trim
    );
    up.plate(
        [
            [-3.4, 4.5, 29.2],
            [3.4, 4.5, 29.2],
            [3.4, 4.5, 27],
            [-3.4, 4.5, 27],
        ],
        [0, 1, 0],
        s.panel,
        { bias: 0.8 }
    );

    // Helmet: a black shell with a yellow crest and an amber visor.
    up.blob([0, 0.3, 37.5], 7.4, 7.8, 7.6, 0x2c2f35);
    up.blob([0, 3.9, 37.3], 5.8, 4.4, 4.2, 0xe8a21e, { floor: -0.2, bias: 0.4 });
    up.rod([0, -6.4, 42], [0, -1.6, 44.6], 0.9, s.trim, { bias: 0.3 });
    up.rod([0, -1.6, 44.6], [0, 3.4, 44.3], 0.9, s.trim, { bias: 0.3 });
    for (const side of [-1, 1])
        up.blob([side * 7.4, 0.2, 37.4], 1.7, 2.8, 2.8, s.trim, { bands: 3, sides: 8 });

    // Back: a gray power pack with coiled cables.
    up.box(-5.8, 5.8, -9, -4.2, 17.6, 31, 0x585d65, { taper: 0.4 });
    up.rod([-4, -9.8, 28.8], [4, -9.8, 28.8], 1, 0xc2432f, { bias: 0.3 });
    up.rod([-4, -9.8, 26], [4, -9.8, 26], 1, 0x3aa6c4, { bias: 0.3 });
    up.rod([-4, -9.8, 23.2], [4, -9.8, 23.2], 1, 0xf0bc1c, { bias: 0.3 });
    up.cyl(0, -7, 1.4, 1.4, 31, 34, 0x9aa5a8, { sides: 6 });

    // A big wrench in the right hand, a cutting torch in the left.
    up.rod([8.6, 3.4, 18.6], [9, 12.6, 21.6], 1.1, 0xb7c0c6);
    up.box(8.2 - 1.6, 9.4 + 1.6, 12.6, 15.4, 20.2, 23.4, 0xb7c0c6, { taper: 0.5, bias: 0.2 });
    up.rod([-8.4, 4.4, 19.6], [-8.8, 10.4, 20.4], 1.2, 0x5d6168);
    up.rod([-8.8, 10.4, 20.4], [-8.9, 13.4, 20.6], 0.6, 0xe8e0d0);
    up.glow([-8.9, 14.3, 20.6], 1.5, 0x7fe0ff, 0.9, { bias: 0.9 });
}

// --- Robot -------------------------------------------------------------------------------------

export function drawRobot(c: Cast): void {
    const up = c.up;
    const shell = c.team ?? 0x6a6f76;
    const dark = 0x3d4146;
    const wire = 0xd9742a;
    const eye = 0x58efe0;

    // Four spidery legs from a pedestal; diagonal pairs step together.
    const lo = c.lo;
    lo.cyl(0, 0, 3.4, 3, 0, 13, dark, { sides: 8 });
    for (const [su, sv] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
    ]) {
        const { hip, knee, ankle } = robotLeg(c.stride, su, sv);
        lo.rod(hip, knee, 1.5, dark);
        lo.rod(knee, ankle, 1.5, dark);
        lo.cyl(ankle[0], ankle[1], 2.2, 1.8, ankle[2] - 0.6, ankle[2] + 1, 0x2a2d31, { sides: 7 });
        lo.blob(knee, 2, 2, 2, shell, { bands: 3, sides: 7 });
    }

    // The body: a squared-off box with a chamfered lid.
    up.box(-9.5, 9.5, -9.5, 9.5, 14, 29, shell, { taper: 0 });
    up.box(-8.6, 8.6, -8.6, 8.6, 29, 31, dark, { taper: 1.6 });
    up.box(-5, 5, -5, 5, 31, 32.6, shell, { taper: 1.2 });
    up.cyl(6.6, -6.6, 0.9, 0.9, 32, 38, 0x9aa5a8, { sides: 6 });
    up.glow([6.6, -6.6, 38.4], 1.4, 0xff6a4a, 1, { bias: 0.9 });

    // Front: a round lens and a status strip; orange conduit runs up the sides.
    up.cyl(0, 9.2, 5.4, 5.4, 18, 18.01, dark, { sides: 14, outline: false });
    up.plate(
        [
            [-6.2, 9.7, 28],
            [6.2, 9.7, 28],
            [6.2, 9.7, 15],
            [-6.2, 9.7, 15],
        ],
        [0, 1, 0],
        0x50555c
    );
    up.blob([0, 10.3, 22.2], 4.4, 1.6, 4.4, 0x24282c, {
        bands: 3,
        sides: 14,
        floor: -0.99,
        bias: 1,
    });
    up.blob([0, 11.3, 22.2], 3, 1.2, 3, eye, { bands: 3, sides: 12, floor: -0.99, bias: 1.2 });
    up.plate(
        [
            [-5, 9.8, 27],
            [5, 9.8, 27],
            [5, 9.8, 26],
            [-5, 9.8, 26],
        ],
        [0, 1, 0],
        wire,
        { bias: 0.8 }
    );
    for (const side of [-1, 1]) {
        up.rod([side * 9.7, 6, 28], [side * 9.7, 6, 16], 0.9, wire, { bias: 0.2 });
        up.rod([side * 9.7, 3, 28], [side * 9.7, 3, 16], 0.9, wire, { bias: 0.2 });
    }
    up.plate(
        [
            [-9.6, -9.7, 28],
            [9.6, -9.7, 28],
            [9.6, -9.7, 15],
            [-9.6, -9.7, 15],
        ],
        [0, -1, 0],
        0x555a61
    );

    // Two arms with pincer claws.
    for (const side of [-1, 1]) {
        const shoulder: [number, number, number] = [side * 10.4, 3, 24];
        const elbow: [number, number, number] = [side * 15, 6, 19];
        const wrist: [number, number, number] = [side * 14, 12, 18.4];
        up.rod(shoulder, elbow, 1.7, dark);
        up.rod(elbow, wrist, 1.5, shell);
        up.blob(elbow, 2.2, 2.2, 2.2, shell, { bands: 3, sides: 8 });
        up.rod(wrist, [side * 12.2, 16.4, 18.4], 0.8, 0xb7c0c6);
        up.rod(wrist, [side * 15.8, 16.4, 18.4], 0.8, 0xb7c0c6);
    }
}
