// The five characters' bodies, each in a suit made for its job. All are posed in the rig's local
// frame (u right, v ahead, z up, px) standing at the origin; the three humanoids share a build and
// differ in suit, helmet, pack and what they carry. The Robot is its own machine.

import type { CharacterId } from '../../types/shared';
import type { Rig } from './rig';

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

const LEG_U = 3.6;

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

/** The legs, hips, trunk, neck and arms every humanoid has, reaching to `hands`. */
function body(rig: Rig, s: Suit, hands: Hands): void {
    for (const side of [-1, 1]) {
        const u = side * LEG_U;
        rig.box(u - 2.8, u + 2.8, -3.4, 6.2, 0, 4.6, s.boots, { taper: 0.5 });
        rig.tube([u, 0.4, 4.4], [u, 0, 10], 2.7, 2.9, s.suit);
        rig.tube([u, 0, 10], [u, 0, 17], 3, 3.3, s.suit);
        rig.blob([u, 2.4, 10.2], 2.6, 1.6, 2.2, s.panel, { bands: 3, sides: 8 }); // knee pad
    }
    rig.box(-5.4, 5.4, -3.6, 3.6, 16.5, 21.2, s.panel, { taper: 0.3 });
    rig.box(-6.6, 6.6, -4.3, 4.3, 20.5, 31, s.suit, { taper: 0.9 });
    rig.cyl(0, 0, 3.5, 3.4, 30.5, 33.2, s.panel);

    for (const side of [-1, 1] as const) {
        const hand = side < 0 ? hands.left : hands.right;
        const shoulder: [number, number, number] = [side * 7.9, 0, 28.6];
        const elbow: [number, number, number] = [
            (shoulder[0] + hand[0]) / 2 + side * 1.2,
            (shoulder[1] + hand[1]) / 2 - 1,
            (shoulder[2] + hand[2]) / 2 - 1.2,
        ];
        rig.tube(shoulder, elbow, 2.7, 2.4, s.suit, { sides: 8 });
        rig.tube(elbow, hand, 2.4, 2.2, s.suit, { sides: 8 });
        rig.blob(elbow, 2.7, 2.7, 2.4, s.panel, { bands: 3, sides: 8, bias: 0.3 });
        rig.blob(shoulder, 3.4, 3.4, 3.2, s.suit, { bands: 4, sides: 10, bias: 0.3 });
        rig.blob([hand[0], hand[1], hand[2] - 0.6], 2.6, 2.6, 2.6, s.gloves, {
            bands: 3,
            sides: 8,
        });
    }
}

// --- Farmer ------------------------------------------------------------------------------------

export function drawFarmer(rig: Rig): void {
    const s: Suit = {
        suit: 0x667a3e,
        panel: 0x4a5a2c,
        trim: 0xc9a84a,
        boots: 0x6a4527,
        gloves: 0xb08a55,
    };
    const hands: Hands = { left: [-8.4, 3, 19.5], right: [8.4, 5, 20.5] };
    body(rig, s, hands);

    // Chest: a seed-pouch harness and a row of small pockets.
    rig.plate(
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
        rig.plate(
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
    rig.blob([0, 0.3, 37.5], 7.4, 7.8, 7.6, 0x6f8445);
    rig.blob([0, 4, 37.6], 5.6, 4.2, 4.6, 0xd39a2e, { floor: -0.2, bias: 0.4 });
    rig.box(-8, 8, 3.4, 10.6, 40.4, 41.4, 0x4a5a2c, { taper: 2, bias: 0.6 });
    rig.cyl(-4.4, -6.4, 1, 1, 42, 47, 0x4a5a2c, { sides: 6 }); // a little antenna
    rig.glow([-4.4, -6.4, 47.2], 1.4, 0xe9d36a, 1, { bias: 0.8 });

    // Back: a sprayer tank (two green canisters) with a hose to the nozzle.
    rig.box(-5.6, 5.6, -8.8, -4.2, 18.6, 31, 0x4a5a2c, { taper: 0.4 });
    for (const u of [-3.2, 3.2]) {
        rig.cyl(u, -10.2, 2.9, 2.9, 19, 32, 0x7cc15a, { sides: 10 });
        rig.cyl(u, -10.2, 3.1, 3.1, 24, 25.4, 0xd9e6a8, { sides: 10, bias: 0.2 });
        rig.cyl(u, -10.2, 1.2, 1.2, 32, 33.6, 0x9aa5a8, { sides: 6, bias: 0.2 });
    }
    rig.rod([3.2, -10.2, 33], [8, -6, 33.8], 0.7, 0x3d4a24);
    rig.rod([8, -6, 33.8], [10.6, 0, 27], 0.7, 0x3d4a24);
    rig.rod([10.6, 0, 27], [8.6, 3.2, 21.5], 0.7, 0x3d4a24);

    // The sprayer in the right hand: a green tank with a nozzle.
    rig.rod([8.4, 3.4, 20.6], [8.6, 11, 21.6], 2.1, 0x7cc15a);
    rig.rod([8.6, 11, 21.6], [8.7, 15.2, 21.8], 0.9, 0x9aa5a8);
    rig.rod([8.5, 6.6, 21.2], [8.5, 7.8, 21.3], 2.4, 0xd9e6a8);
    // A hand trowel on the left hip.
    rig.rod([-9.2, 1, 14.4], [-9.4, 5.4, 12.6], 0.9, 0xc9ced1);
}

// --- Scientist ---------------------------------------------------------------------------------

export function drawScientist(rig: Rig): void {
    const s: Suit = {
        suit: 0xe3ebf0,
        panel: 0xb6c6d2,
        trim: 0x45c4e8,
        boots: 0xcbd7df,
        gloves: 0x45c4e8,
    };
    const hands: Hands = { left: [-4.6, 7.2, 21.8], right: [4.6, 7.2, 21.8] };
    body(rig, s, hands);

    // Chest: a status panel, and cyan stripes down the sleeves and legs.
    rig.plate(
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
        rig.glow([u, 4.7, 26.7], 0.7, c, 1, { bias: 0.5 });
    }
    for (const side of [-1, 1]) {
        rig.cyl(side * LEG_U, 0, 3.4, 3.4, 12.4, 13.8, s.trim);
        rig.cyl(side * 7.9, 0, 3.1, 3.1, 25.8, 27.2, s.trim, { bias: 0.1 });
    }

    // Helmet: a clear bubble over a face.
    rig.blob([0, 0.8, 37.2], 5.9, 6, 6.4, 0xdcae82, { outline: false });
    rig.blob([0, -0.4, 39.4], 6.1, 6.3, 5, 0x5a3b26, { floor: 0.3, outline: false, bias: 0.2 });
    if (rig.front > 0.25) {
        for (const u of [-2.2, 2.2]) rig.glow([u, 6.2, 36.6], 0.75, 0x2b2118, 1, { bias: 0.9 });
    }
    rig.cyl(0, 0, [6, 6.3], [5.4, 5.6], 31.5, 34, s.suit, { bias: 0.3 });
    rig.blob([0, 0.4, 37.5], 7.8, 8.1, 8, 0xcdeaf5, { alpha: 0.16, bias: 4, rim: 0x9db8c6 });

    // Back: a life-support pack with a glowing display.
    rig.box(-5.4, 5.4, -8.6, -4.2, 18.6, 31, s.suit, { taper: 0.4 });
    rig.plate(
        [
            [-3.6, -8.7, 29],
            [3.6, -8.7, 29],
            [3.6, -8.7, 21.4],
            [-3.6, -8.7, 21.4],
        ],
        [0, -1, 0],
        0x2f6f8a
    );
    rig.plate(
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
    rig.cyl(-3.4, -6.6, 1.3, 1.3, 31, 34, 0xff7b6b, { sides: 6 });
    rig.cyl(3.4, -6.6, 1.3, 1.3, 31, 34, 0x6adcf2, { sides: 6 });

    // A data tablet held at the chest, its screen turned toward the scientist.
    rig.box(-4.4, 4.4, 6.2, 7.4, 20.4, 27.6, 0x39464f, { taper: 0.2 });
    rig.plate(
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
    rig.plate(
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

export function drawExplorer(rig: Rig): void {
    const s: Suit = {
        suit: 0xd0592a,
        panel: 0x8c3a1c,
        trim: 0xf2c14e,
        boots: 0x6b3a22,
        gloves: 0x4a3328,
    };
    const hands: Hands = { left: [-8.4, 6.2, 22], right: [8.4, 2.6, 18.6] };
    body(rig, s, hands);

    // Chest: crossed harness straps and a pocket; heavy knee and elbow pads are in `body`.
    for (const side of [-1, 1]) {
        rig.plate(
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
    rig.plate(
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
    rig.blob([0, 0.3, 37.5], 7.4, 7.8, 7.6, 0xe0743a);
    rig.blob([0, 3.9, 37], 5.8, 4.4, 4.6, 0x1f3340, { floor: -0.2, bias: 0.4 });
    rig.glow([-1.8, 7.3, 38.4], 1.1, 0x9ad4e8, 0.9, { bias: 1 });
    rig.cyl(0, 6.3, 2.4, 2, 41.4, 43.4, 0x4a3328, { sides: 8, bias: 0.6 });
    rig.glow([0, 8.4, 42.6], 1.7, 0xfff0a0, 1, { bias: 0.9 });
    for (const side of [-1, 1])
        rig.blob([side * 7.4, 0, 37.5], 1.7, 2.6, 2.6, 0x4a3328, { bands: 3, sides: 8 });

    // Back: a big pack with a rolled tent and a coil of rope.
    rig.box(-6.6, 6.6, -10.4, -4.2, 16, 31.5, s.panel, { taper: 0.6 });
    rig.box(-5.2, 5.2, -11.4, -10.4, 18.5, 28.5, s.suit, { taper: 0.4 });
    rig.rod([-6.6, -8.2, 34], [6.6, -8.2, 34], 3, 0xb9a27a);
    rig.rod([-6.6, -8.2, 34], [-6.6, -8.2, 34.1], 3.1, 0x8a7a58, { outline: false, bias: 0.2 });
    rig.rod([-3.2, -8.2, 31.6], [-3.2, -8.2, 36.6], 0.6, 0x4a3328, { bias: 0.4 });
    rig.rod([3.2, -8.2, 31.6], [3.2, -8.2, 36.6], 0.6, 0x4a3328, { bias: 0.4 });
    rig.cyl(7.3, -7.4, 2.4, 2.4, 20, 26, 0xc8b788, { sides: 9 });
    rig.cyl(-7.3, -7.4, 2.2, 2.2, 18, 25, 0x9aa5a8, { sides: 9 });

    // A scanner in the left hand (a screen and an antenna); a pickaxe hangs from the right.
    rig.box(-10.8, -6.2, 5, 9.4, 20, 23.6, 0x5a646c, { taper: 0.3 });
    rig.plate(
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
    rig.rod([-10.2, 8.8, 23.6], [-10.6, 9.4, 29], 0.45, 0x9aa5a8);
    rig.rod([9.2, 2.6, 16.6], [9.6, 6.4, 8.4], 0.8, 0x6b3a22);
    rig.rod([8.6, 6.4, 9.6], [10.8, 6.6, 7.4], 1, 0xb7c0c6);
}

// --- Engineer ----------------------------------------------------------------------------------

export function drawEngineer(rig: Rig): void {
    const s: Suit = {
        suit: 0x3b4047,
        panel: 0x2a2d32,
        trim: 0xf0bc1c,
        boots: 0x24272b,
        gloves: 0x5d6168,
    };
    const hands: Hands = { left: [-8.4, 4.4, 19.6], right: [8.6, 3.4, 18.4] };
    body(rig, s, hands);

    // Hazard bands on the thighs, shins and sleeves; a yellow utility belt with pouches.
    for (const side of [-1, 1]) {
        rig.cyl(side * LEG_U, 0, 3.4, 3.4, 14.2, 15.8, s.trim, { bias: 0.1 });
        rig.cyl(side * LEG_U, 0, 3.0, 3.0, 6.6, 8, s.trim, { bias: 0.1 });
        rig.cyl(side * 8.1, 0.4, 2.9, 2.9, 25.2, 26.6, s.trim, { bias: 0.15, sides: 8 });
    }
    rig.cyl(0, 0, [6.6, 4.6], [6.6, 4.6], 19.4, 21.4, s.trim, { sides: 14, bias: 0.2 });
    for (const u of [-5.4, 5.4])
        rig.box(u - 1.4, u + 1.4, -1.8, 2.4, 14.8, 19.4, 0x60646b, { taper: 0.3, bias: 0.6 });
    rig.plate(
        [
            [-4.2, 4.4, 30],
            [4.2, 4.4, 30],
            [4.2, 4.4, 26.2],
            [-4.2, 4.4, 26.2],
        ],
        [0, 1, 0],
        s.trim
    );
    rig.plate(
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
    rig.blob([0, 0.3, 37.5], 7.4, 7.8, 7.6, 0x2c2f35);
    rig.blob([0, 3.9, 37.3], 5.8, 4.4, 4.2, 0xe8a21e, { floor: -0.2, bias: 0.4 });
    rig.rod([0, -6.4, 42], [0, -1.6, 44.6], 0.9, s.trim, { bias: 0.3 });
    rig.rod([0, -1.6, 44.6], [0, 3.4, 44.3], 0.9, s.trim, { bias: 0.3 });
    for (const side of [-1, 1])
        rig.blob([side * 7.4, 0.2, 37.4], 1.7, 2.8, 2.8, s.trim, { bands: 3, sides: 8 });

    // Back: a gray power pack with coiled cables.
    rig.box(-5.8, 5.8, -9, -4.2, 17.6, 31, 0x585d65, { taper: 0.4 });
    rig.rod([-4, -9.8, 28.8], [4, -9.8, 28.8], 1, 0xc2432f, { bias: 0.3 });
    rig.rod([-4, -9.8, 26], [4, -9.8, 26], 1, 0x3aa6c4, { bias: 0.3 });
    rig.rod([-4, -9.8, 23.2], [4, -9.8, 23.2], 1, 0xf0bc1c, { bias: 0.3 });
    rig.cyl(0, -7, 1.4, 1.4, 31, 34, 0x9aa5a8, { sides: 6 });

    // A big wrench in the right hand, a cutting torch in the left.
    rig.rod([8.6, 3.4, 18.6], [9, 12.6, 21.6], 1.1, 0xb7c0c6);
    rig.box(8.2 - 1.6, 9.4 + 1.6, 12.6, 15.4, 20.2, 23.4, 0xb7c0c6, { taper: 0.5, bias: 0.2 });
    rig.rod([-8.4, 4.4, 19.6], [-8.8, 10.4, 20.4], 1.2, 0x5d6168);
    rig.rod([-8.8, 10.4, 20.4], [-8.9, 13.4, 20.6], 0.6, 0xe8e0d0);
    rig.glow([-8.9, 14.3, 20.6], 1.5, 0x7fe0ff, 0.9, { bias: 0.9 });
}

// --- Robot -------------------------------------------------------------------------------------

export function drawRobot(rig: Rig): void {
    const shell = 0x6a6f76;
    const dark = 0x3d4146;
    const wire = 0xd9742a;
    const eye = 0x58efe0;

    // Four spidery legs from a pedestal.
    rig.cyl(0, 0, 3.4, 3, 0, 13, dark, { sides: 8 });
    for (const [su, sv] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
    ]) {
        const hip: [number, number, number] = [su * 4, sv * 4, 12];
        const knee: [number, number, number] = [su * 11, sv * 11, 15];
        const foot: [number, number, number] = [su * 13.4, sv * 13.4, 0.6];
        rig.rod(hip, knee, 1.5, dark);
        rig.rod(knee, foot, 1.5, dark);
        rig.cyl(foot[0], foot[1], 2.2, 1.8, 0, 1.6, 0x2a2d31, { sides: 7 });
        rig.blob(knee, 2, 2, 2, shell, { bands: 3, sides: 7 });
    }

    // The body: a squared-off box with a chamfered lid.
    rig.box(-9.5, 9.5, -9.5, 9.5, 14, 29, shell, { taper: 0 });
    rig.box(-8.6, 8.6, -8.6, 8.6, 29, 31, dark, { taper: 1.6 });
    rig.box(-5, 5, -5, 5, 31, 32.6, shell, { taper: 1.2 });
    rig.cyl(6.6, -6.6, 0.9, 0.9, 32, 38, 0x9aa5a8, { sides: 6 });
    rig.glow([6.6, -6.6, 38.4], 1.4, 0xff6a4a, 1, { bias: 0.9 });

    // Front: a round lens and a status strip; orange conduit runs up the sides.
    rig.cyl(0, 9.2, 5.4, 5.4, 18, 18.01, dark, { sides: 14, outline: false });
    rig.plate(
        [
            [-6.2, 9.7, 28],
            [6.2, 9.7, 28],
            [6.2, 9.7, 15],
            [-6.2, 9.7, 15],
        ],
        [0, 1, 0],
        0x50555c
    );
    rig.blob([0, 10.3, 22.2], 4.4, 1.6, 4.4, 0x24282c, {
        bands: 3,
        sides: 14,
        floor: -0.99,
        bias: 1,
    });
    rig.blob([0, 11.3, 22.2], 3, 1.2, 3, eye, { bands: 3, sides: 12, floor: -0.99, bias: 1.2 });
    rig.plate(
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
        rig.rod([side * 9.7, 6, 28], [side * 9.7, 6, 16], 0.9, wire, { bias: 0.2 });
        rig.rod([side * 9.7, 3, 28], [side * 9.7, 3, 16], 0.9, wire, { bias: 0.2 });
    }
    rig.plate(
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
        rig.rod(shoulder, elbow, 1.7, dark);
        rig.rod(elbow, wrist, 1.5, shell);
        rig.blob(elbow, 2.2, 2.2, 2.2, shell, { bands: 3, sides: 8 });
        rig.rod(wrist, [side * 12.2, 16.4, 18.4], 0.8, 0xb7c0c6);
        rig.rod(wrist, [side * 15.8, 16.4, 18.4], 0.8, 0xb7c0c6);
    }
}
