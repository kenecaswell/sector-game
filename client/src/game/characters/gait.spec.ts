import { describe, expect, it } from 'vitest';
import {
    BOB,
    STANDING,
    STRIDE_FRAMES,
    STRIDE_LENGTH,
    advancePhase,
    alongLeg,
    bobOffset,
    chooseLegs,
    frameOfPhase,
    humanLeg,
    robotLeg,
    strideFrame,
} from './gait';

describe('chooseLegs', () => {
    it('faces the legs where the body aims when standing still', () => {
        for (let aim = 0; aim < 8; aim++) {
            expect(chooseLegs(aim, null)).toEqual({ direction: aim, reverse: false });
        }
    });

    it('faces the legs the way they walk, up to a quarter turn from the aim', () => {
        expect(chooseLegs(2, 2)).toEqual({ direction: 2, reverse: false }); // walking the way it aims
        expect(chooseLegs(2, 4)).toEqual({ direction: 4, reverse: false }); // strafing
        expect(chooseLegs(2, 0)).toEqual({ direction: 0, reverse: false });
        expect(chooseLegs(2, 3)).toEqual({ direction: 3, reverse: false });
    });

    it('walking away from the aim, faces the legs with the body and runs the stride backward', () => {
        expect(chooseLegs(2, 6)).toEqual({ direction: 2, reverse: true }); // straight backward
        expect(chooseLegs(2, 5)).toEqual({ direction: 1, reverse: true });
        expect(chooseLegs(2, 7)).toEqual({ direction: 3, reverse: true });
    });

    it('never twists the body more than a quarter turn from the legs', () => {
        for (let aim = 0; aim < 8; aim++) {
            for (let move = 0; move < 8; move++) {
                const { direction } = chooseLegs(aim, move);
                const twist = Math.min((direction - aim + 8) % 8, (aim - direction + 8) % 8);
                expect(twist).toBeLessThanOrEqual(2);
            }
        }
    });

    it('wraps around the compass', () => {
        expect(chooseLegs(7, 1)).toEqual({ direction: 1, reverse: false });
        expect(chooseLegs(0, 7)).toEqual({ direction: 7, reverse: false });
    });
});

describe('the stride', () => {
    it('advances with the ground covered: one cycle per STRIDE_LENGTH', () => {
        expect(advancePhase(0, STRIDE_LENGTH / 4)).toBeCloseTo(0.25);
        expect(advancePhase(0.9, STRIDE_LENGTH / 5)).toBeCloseTo(0.1);
        expect(advancePhase(0, STRIDE_LENGTH * 3)).toBeCloseTo(0);
    });

    it('runs backward and wraps', () => {
        expect(advancePhase(0.1, STRIDE_LENGTH / 5, -1)).toBeCloseTo(0.9);
        expect(advancePhase(0.5, STRIDE_LENGTH / 4, -1)).toBeCloseTo(0.25);
        expect(advancePhase(0, 0)).toBe(0);
    });

    it('has a frame for every point in the cycle', () => {
        expect(frameOfPhase(0)).toBe(0);
        expect(frameOfPhase(0.999)).toBe(STRIDE_FRAMES - 1);
        const seen = new Set(Array.from({ length: 100 }, (_, i) => frameOfPhase(i / 100)));
        expect(seen.size).toBe(STRIDE_FRAMES);
        expect(strideFrame(0)).toEqual({ phase: 0, amount: 1 });
        expect(strideFrame(STRIDE_FRAMES)).toEqual(strideFrame(0));
    });

    it('dips and rises twice a cycle, lowest as the legs are stretched', () => {
        expect(bobOffset(0, 1)).toBeCloseTo(0);
        expect(bobOffset(0.25, 1)).toBeCloseTo(BOB);
        expect(bobOffset(0.5, 1)).toBeCloseTo(0);
        expect(bobOffset(0.75, 1)).toBeCloseTo(BOB);
        expect(bobOffset(0.25, 0)).toBe(0); // standing: no bob
    });
});

describe('legs', () => {
    it('stand straight under the hips when standing', () => {
        for (const side of [-1, 1] as const) {
            const { hip, knee, ankle } = humanLeg(STANDING, side);
            expect(ankle[1]).toBe(0);
            expect(hip[0]).toBe(ankle[0]);
            expect(knee[2]).toBeGreaterThan(ankle[2]);
            expect(knee[2]).toBeLessThan(hip[2]);
        }
    });

    it('swing in opposite directions, and lift only the leg that is swinging forward', () => {
        const stride = strideFrame(1);
        const left = humanLeg(stride, -1);
        const right = humanLeg(stride, 1);
        expect(Math.sign(left.ankle[1])).toBe(-Math.sign(right.ankle[1]));
        expect(Math.max(left.ankle[2], right.ankle[2])).toBeGreaterThan(
            Math.min(left.ankle[2], right.ankle[2])
        );
    });

    it('keep a foot on the ground at some point in every stride', () => {
        for (let f = 0; f < STRIDE_FRAMES; f++) {
            const legs = [-1, 1].map((side) => humanLeg(strideFrame(f), side as -1 | 1));
            expect(Math.min(...legs.map((l) => l.ankle[2]))).toBeCloseTo(4.6);
        }
    });

    it('never stretch much past their standing length (a leg that grows looks wrong)', () => {
        const length = (leg: ReturnType<typeof humanLeg>) =>
            Math.hypot(...leg.hip.map((v, i) => v - leg.ankle[i]));
        const standing = length(humanLeg(STANDING, 1));
        for (let f = 0; f < STRIDE_FRAMES; f++) {
            for (const side of [-1, 1] as const) {
                expect(length(humanLeg(strideFrame(f), side))).toBeLessThan(standing * 1.18);
            }
        }
    });

    it('can be walked along from ankle to hip', () => {
        const leg = humanLeg(strideFrame(2), 1);
        expect(alongLeg(leg, 0)).toEqual(leg.ankle);
        expect(alongLeg(leg, 0.5)).toEqual(leg.knee);
        expect(alongLeg(leg, 1)).toEqual(leg.hip);
    });

    it("step the Robot's legs in diagonal pairs", () => {
        const stride = strideFrame(1);
        const a = robotLeg(stride, -1, -1);
        const b = robotLeg(stride, 1, 1);
        const c = robotLeg(stride, 1, -1);
        expect(a.lift).toBeCloseTo(b.lift);
        expect(a.lift).not.toBeCloseTo(c.lift);
        const standing = robotLeg(STANDING, -1, 1);
        expect(standing.lift).toBe(0);
        expect(standing.ankle[2]).toBeCloseTo(0.6);
    });
});
