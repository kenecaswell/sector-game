import { describe, expect, it } from 'vitest';
import { HEX_SIZE, ISO_SQUASH, SCREEN_Y_SCALE } from './constants';
import {
    STRUCTURE_CORNER_OFFSETS,
    hexCenter,
    hexCorners,
    project,
    structureCorners,
    unproject,
} from './hex';

describe('isometric projection', () => {
    it('squashes y by ISO_SQUASH, which is the server-shared SCREEN_Y_SCALE', () => {
        expect(ISO_SQUASH).toBe(SCREEN_Y_SCALE);
        expect(project(100, 200)).toEqual({ x: 100, y: 200 * ISO_SQUASH });
    });

    it('unproject undoes project', () => {
        const back = unproject(project(123.5, 456.25).x, project(123.5, 456.25).y);
        expect(back.x).toBeCloseTo(123.5, 9);
        expect(back.y).toBeCloseTo(456.25, 9);
    });
});

describe('hexCorners', () => {
    it("gives a hex's six corners on screen, starting at the right-hand point", () => {
        const corners = hexCorners(3, 4);
        const center = hexCenter(3, 4);
        expect(corners).toHaveLength(6);
        expect(corners[0].x).toBeCloseTo(center.x + HEX_SIZE, 9);
        expect(corners[0].y).toBeCloseTo(center.y * ISO_SQUASH, 9);
        // Opposite corner is the left-hand point.
        expect(corners[3].x).toBeCloseTo(center.x - HEX_SIZE, 9);
    });
});

describe('structureCorners', () => {
    it('is the shared structure hexagon around the center hex, projected', () => {
        const center = hexCenter(10, 10);
        structureCorners(10, 10).forEach((corner, i) => {
            const offset = STRUCTURE_CORNER_OFFSETS[i];
            expect(corner.x).toBeCloseTo(center.x + offset.x, 9);
            expect(corner.y).toBeCloseTo((center.y + offset.y) * ISO_SQUASH, 9);
        });
    });
});
