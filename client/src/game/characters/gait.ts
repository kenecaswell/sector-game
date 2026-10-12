// How the legs move. A character is drawn in two layers: the legs, which face the way it is walking
// and swing through a stride, and the body (trunk, head, arms and what it carries), which faces the
// way it is aiming. This file is the walking math: plain functions, no drawing, no Phaser.

import type { V3 } from '../structures/canvas';

/** How far through its stride a character is. */
export interface Stride {
    /** 0 to 1 around one full cycle (a step with each leg). */
    phase: number;
    /** 0 standing still, 1 walking: scales how far the legs swing. */
    amount: number;
}

export const STANDING: Stride = { phase: 0, amount: 0 };

/** The walk cycle is drawn in this many frames (a standing frame is separate). */
export const STRIDE_FRAMES = 6;

/** The stride for walk frame `index` (0 to STRIDE_FRAMES - 1). */
export function strideFrame(index: number): Stride {
    return {
        phase: (((index % STRIDE_FRAMES) + STRIDE_FRAMES) % STRIDE_FRAMES) / STRIDE_FRAMES,
        amount: 1,
    };
}

/** Screen px of travel for one full cycle: with the speed this sets how fast the legs go. */
export const STRIDE_LENGTH = 62;

/** Slower than this (px/s on screen) counts as standing still. */
export const MOVING_SPEED = 25;

/** The cycle's progress after travelling `distance` screen px (negative `direction`: backward). */
export function advancePhase(phase: number, distance: number, direction: 1 | -1 = 1): number {
    const next = (phase + (direction * distance) / STRIDE_LENGTH) % 1;
    return next < 0 ? next + 1 : next;
}

/** The walk frame to show for a phase (0 to STRIDE_FRAMES - 1). */
export function frameOfPhase(phase: number): number {
    return Math.floor(phase * STRIDE_FRAMES) % STRIDE_FRAMES;
}

/**
 * Which way the legs face and which way their cycle runs. Standing, they face where the body does.
 * Walking, they face the way they are going, unless that is more than a quarter turn behind the
 * aim (walking backward): then they face the same way as the body and the cycle runs in reverse,
 * so the body never twists more than a quarter turn. `aim` and `move` are facings 0-7.
 */
export function chooseLegs(
    aim: number,
    move: number | null
): { direction: number; reverse: boolean } {
    if (move === null) return { direction: aim, reverse: false };
    const apart = Math.min((move - aim + 8) % 8, (aim - move + 8) % 8); // 0 to 4 facings
    return apart >= 3
        ? { direction: (move + 4) % 8, reverse: true }
        : { direction: move, reverse: false };
}

/** How the body rises and dips while walking: highest as the legs pass, lowest at full stretch (px). */
export const BOB = 1.6;
export function bobOffset(phase: number, amount: number): number {
    return BOB * amount * 0.5 * (1 - Math.cos(4 * Math.PI * phase));
}

// --- The legs' shape ---------------------------------------------------------------------------

/** How far a foot swings forward and back (model px), and how high it lifts. */
const SWING = 7;
const LIFT = 3.4;

export interface Leg {
    hip: V3;
    knee: V3;
    ankle: V3;
}

export const HIP_Z = 17;
export const ANKLE_Z = 4.6;
export const LEG_U = 3.6;

/** One humanoid leg's joints at this stride: `side` is -1 for the left, 1 for the right. */
export function humanLeg(stride: Stride, side: -1 | 1): Leg {
    const theta = 2 * Math.PI * (stride.phase + (side < 0 ? 0 : 0.5));
    const forward = SWING * stride.amount * Math.sin(theta);
    const lift = LIFT * stride.amount * Math.max(0, Math.cos(theta));
    const u = side * LEG_U;
    const hip: V3 = [u, 0, HIP_Z];
    const ankle: V3 = [u, forward, ANKLE_Z + lift];
    const knee: V3 = [
        u,
        forward / 2 + 0.6 * stride.amount + 0.4 * lift,
        (HIP_Z + ANKLE_Z + lift) / 2 + 0.6,
    ];
    return { hip, knee, ankle };
}

/** The point `t` of the way up a leg: 0 at the ankle, 0.5 at the knee, 1 at the hip. */
export function alongLeg(leg: Leg, t: number): V3 {
    const [from, to, k] =
        t < 0.5 ? [leg.ankle, leg.knee, t * 2] : [leg.knee, leg.hip, (t - 0.5) * 2];
    return [
        from[0] + (to[0] - from[0]) * k,
        from[1] + (to[1] - from[1]) * k,
        from[2] + (to[2] - from[2]) * k,
    ];
}

/** One of the Robot's four legs (`su`, `sv` = -1 or 1 for its corner): diagonal pairs step together. */
export function robotLeg(stride: Stride, su: number, sv: number): Leg & { lift: number } {
    const pair = su * sv > 0 ? 0 : 0.5;
    const theta = 2 * Math.PI * (stride.phase + pair);
    const forward = 3.6 * stride.amount * Math.sin(theta);
    const lift = 4.6 * stride.amount * Math.max(0, Math.cos(theta));
    return {
        hip: [su * 4, sv * 4, 12],
        knee: [su * 11, sv * 11 + forward * 0.5, 15 + lift * 0.8],
        ankle: [su * 13.4, sv * 13.4 + forward, 0.6 + lift],
        lift,
    };
}
