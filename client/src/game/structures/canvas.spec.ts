import { describe, expect, it } from 'vitest';
import { ISO_SQUASH } from '../constants';
import { recorder } from '../../test/brush';
import {
    Canvas3D,
    facesViewer,
    insideConvex,
    lightFactor,
    ring,
    shadeColor,
    type Brush,
} from './canvas';

describe('projection', () => {
    it('puts a ground point at its x, squashes y, and lifts z straight up', () => {
        const c = new Canvas3D(recorder().brush, 100, 200);
        expect(c.p(10, 20)).toEqual({ x: 110, y: 200 + 20 * ISO_SQUASH });
        expect(c.p(10, 20, 15)).toEqual({ x: 110, y: 200 + 20 * ISO_SQUASH - 15 });
    });
});

describe('which faces are seen', () => {
    it('shows faces turned toward the viewer (south, and the top) and hides the rest', () => {
        expect(facesViewer([0, 1, 0])).toBe(true); // a south wall
        expect(facesViewer([0, 0, 1])).toBe(true); // a roof
        expect(facesViewer([0, -1, 0])).toBe(false); // a north wall
        expect(facesViewer([1, 0, 0])).toBe(false); // an east wall: edge-on
        expect(facesViewer([-1, 0, 0])).toBe(false);
        expect(facesViewer([0.7, 0.7, 0])).toBe(true); // a south-east wall
    });

    it('lights tops and front walls more than walls turned from the light', () => {
        const top = lightFactor([0, 0, 1]);
        const front = lightFactor([0, 1, 0]);
        const left = lightFactor([-0.7, 0.7, 0]);
        const right = lightFactor([0.7, 0.7, 0]);
        expect(left).toBeGreaterThan(right); // the light is from the upper left
        expect(top).toBeGreaterThan(front);
        expect(front).toBeGreaterThan(right);
        for (const f of [top, front, left, right]) expect(f).toBeGreaterThan(0.4);
    });

    it('darkens for a factor under one and lightens over one, keeping white and black', () => {
        expect(shadeColor(0x808080, 1)).toBe(0x808080);
        expect(shadeColor(0x808080, 0.5)).toBe(0x404040);
        expect(shadeColor(0x808080, 1.5)).toBeGreaterThan(0x808080);
        expect(shadeColor(0x000000, 1.3)).toBeGreaterThan(0);
        expect(shadeColor(0xffffff, 1.3)).toBe(0xffffff);
    });
});

describe('solids', () => {
    it('a box shows its front wall and top, nothing else (east and west are edge-on)', () => {
        const { brush, polygons } = recorder();
        new Canvas3D(brush, 0, 0).box(-10, 10, -5, 5, 0, 8, 0x888888);
        expect(polygons).toHaveLength(2);
        // The top is higher on the screen than the front wall's top edge is low.
        const [front, top] = polygons;
        expect(Math.max(...front.map((p) => p.y))).toBe(5 * ISO_SQUASH);
        expect(Math.max(...top.map((p) => p.y))).toBeCloseTo(5 * ISO_SQUASH - 8);
    });

    it('a box with no top is just the front wall', () => {
        const { brush, polygons } = recorder();
        new Canvas3D(brush, 0, 0).box(-10, 10, -5, 5, 0, 8, 0x888888, { top: null });
        expect(polygons).toHaveLength(1);
    });

    it('a cylinder shows about half its sides, each lit differently, plus the top', () => {
        const { brush, polygons } = recorder();
        const colors = new Set<string>();
        const spy: Brush = {
            ...brush,
            fillStyle: (color, alpha) => (colors.add(String(color)), brush.fillStyle(color, alpha)),
        };
        new Canvas3D(spy, 0, 0).cylinder(0, 0, 6, 6, 0, 20, 0x9aa3aa, {}, 16);
        expect(polygons.length).toBeGreaterThanOrEqual(8);
        expect(polygons.length).toBeLessThanOrEqual(10);
        expect(colors.size).toBeGreaterThan(4); // shaded round the curve
    });

    it('a frustum narrows toward its top, and a loft reports each face it draws', () => {
        const { brush, points } = recorder();
        const faces: number[] = [];
        new Canvas3D(brush, 0, 0).cylinder(
            0,
            0,
            8,
            3,
            0,
            30,
            0xaaaaaa,
            { face: (_q, _n, _f, i) => faces.push(i) },
            12
        );
        expect(faces.length).toBeGreaterThan(3);
        const lowWidth = Math.max(...points.filter((p) => p.y > -1).map((p) => Math.abs(p.x)));
        const highWidth = Math.max(...points.filter((p) => p.y < -28).map((p) => Math.abs(p.x)));
        expect(lowWidth).toBeCloseTo(8);
        expect(highWidth).toBeCloseTo(3);
    });

    it('draws the same thing every time', () => {
        const draw = () => {
            const r = recorder();
            new Canvas3D(r.brush, 5, 5).cylinder(1, 2, 4, 4, 0, 9, 0x123456);
            return r.calls;
        };
        expect(draw()).toEqual(draw());
    });
});

describe('helpers', () => {
    it('ring makes evenly spaced corners around a center', () => {
        const corners = ring(10, 20, 5, 6);
        expect(corners).toHaveLength(6);
        for (const p of corners) expect(Math.hypot(p.x - 10, p.y - 20)).toBeCloseTo(5);
        expect(corners[0]).toEqual({ x: 15, y: 20 });
    });

    it('insideConvex works for either winding', () => {
        const square = [
            { x: 0, y: 0 },
            { x: 10, y: 0 },
            { x: 10, y: 10 },
            { x: 0, y: 10 },
        ];
        expect(insideConvex(square, 5, 5)).toBe(true);
        expect(insideConvex(square, 15, 5)).toBe(false);
        expect(insideConvex([...square].reverse(), 5, 5)).toBe(true);
    });

    it('speckle stays inside the polygon and is repeatable', () => {
        const triangle = [
            { x: 0, y: 0 },
            { x: 20, y: 0 },
            { x: 0, y: 20 },
        ];
        const run = () => {
            const r = recorder();
            let seed = 7;
            const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
            new Canvas3D(r.brush, 0, 0).speckle(triangle, random, 80, [0xff0000], 1);
            return r;
        };
        const a = run();
        expect(a.calls.filter((c) => c.startsWith('rect')).length).toBeGreaterThan(10);
        for (const p of a.points) expect(p.x + p.y).toBeLessThanOrEqual(20 + 2.01); // a speck is 1 px square
        expect(run().calls).toEqual(a.calls);
    });
});
