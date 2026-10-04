import { describe, expect, it, vi } from 'vitest';
import { hexCenter, hexNeighbors } from '../hex';
import { compactFootprint } from '../../../../shared/hex';
import { STRUCTURE_TYPES, type StructureType } from '../../types/shared';
import { recorder } from '../../test/brush';
import {
    ART_CANVAS,
    SMOKE_EVERY_MS,
    SMOKE_KEY,
    SmokeEmitter,
    bakeStructure,
    drawStructure,
    smokeSources,
    structureTextureKey,
} from './index';
import { SEVEN_HEX_CENTERS } from './common';
import { DOME_HEIGHT, DOME_RADIUS, domePanels } from './farm';
import type { Pt } from './canvas';

const RED = 0xe74c3c;
const BLUE = 0x3498db;

/** A Guard Tower's three hexes, relative to their middle, as GameScene works them out. */
function towerHexes(): Pt[] {
    const centers = compactFootprint(10, 10, 0).map((h) => hexCenter(h.col, h.row));
    const x = centers.reduce((s, c) => s + c.x, 0) / 3;
    const y = centers.reduce((s, c) => s + c.y, 0) / 3;
    return centers.map((c) => ({ x: c.x - x, y: c.y - y }));
}

const draw = (type: StructureType, color = RED) => {
    const r = recorder();
    drawStructure(r.brush, type, color, type === 'guardTower' ? towerHexes() : undefined);
    return r;
};

describe('structure art', () => {
    it.each(STRUCTURE_TYPES)('%s draws a lot, the same way every time', (type) => {
        const a = draw(type);
        expect(a.calls.length).toBeGreaterThan(80);
        expect(draw(type).calls).toEqual(a.calls);
    });

    it.each(STRUCTURE_TYPES)('%s fits in its texture, with room to spare', (type) => {
        const { points } = draw(type);
        const xs = points.map((p) => p.x);
        const ys = points.map((p) => p.y);
        expect(Math.min(...xs)).toBeGreaterThanOrEqual(2);
        expect(Math.max(...xs)).toBeLessThanOrEqual(ART_CANVAS.width - 2);
        expect(Math.min(...ys)).toBeGreaterThanOrEqual(2);
        expect(Math.max(...ys)).toBeLessThanOrEqual(ART_CANVAS.height - 2);
    });

    it.each(STRUCTURE_TYPES)('%s is built around the origin and stands on the ground', (type) => {
        const { points } = draw(type);
        const xs = points.map((p) => p.x - ART_CANVAS.originX);
        // Roughly centered left to right...
        expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeGreaterThan(-25);
        expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeLessThan(25);
        // ...rising well above the ground point and reaching a little below it (the pad's front).
        expect(ART_CANVAS.originY - Math.min(...points.map((p) => p.y))).toBeGreaterThan(35);
        expect(Math.max(...points.map((p) => p.y)) - ART_CANVAS.originY).toBeLessThan(55);
    });

    it.each(STRUCTURE_TYPES)(
        '%s shows its owner in the team color, and changes with it',
        (type) => {
            const red = draw(type, RED).calls;
            const blue = draw(type, BLUE).calls;
            expect(red.some((c) => c.includes(RED.toString(16)))).toBe(true);
            expect(red.some((c) => c.includes(BLUE.toString(16)))).toBe(false);
            expect(blue.some((c) => c.includes(BLUE.toString(16)))).toBe(true);
            expect(blue).not.toEqual(red);
        }
    );

    it('the four types look different from each other', () => {
        const logs = STRUCTURE_TYPES.map((type) => draw(type).calls.join('|'));
        expect(new Set(logs).size).toBe(4);
    });

    it('a Guard Tower is the tallest of the four, and a farm the lowest', () => {
        const height = (type: StructureType) =>
            ART_CANVAS.originY - Math.min(...draw(type).points.map((p) => p.y));
        expect(height('guardTower')).toBeGreaterThan(height('power'));
        expect(height('guardTower')).toBeGreaterThan(height('fabricator'));
        expect(height('farm')).toBeLessThan(height('fabricator'));
    });

    it("a Guard Tower's pad follows the three hexes it covers", () => {
        const tower = draw('guardTower').points;
        const farm = draw('farm').points;
        // The clump of three hexes reaches about 64 px from its middle; the seven hexes of a farm 80.
        const reach = (points: Pt[]) =>
            Math.max(...points.map((p) => Math.abs(p.x - ART_CANVAS.originX)));
        expect(reach(tower)).toBeGreaterThan(55);
        expect(reach(tower)).toBeLessThan(70);
        expect(reach(farm)).toBeGreaterThan(75);
        // A different clump gives a different pad.
        const other = recorder();
        drawStructure(other.brush, 'guardTower', RED, [
            { x: 0, y: 0 },
            { x: 55, y: 0 },
            { x: 27, y: 48 },
        ]);
        expect(other.calls).not.toEqual(draw('guardTower').calls);
    });

    it("a Guard Tower's pad is in the owner's color, not a flat slate", () => {
        const slate = (0x5d5a55).toString(16);
        const red = draw('guardTower', RED).calls;
        const blue = draw('guardTower', BLUE).calls;
        expect(red.some((c) => c.startsWith(`fill ${slate}`))).toBe(false);
        // The pad's top and its grit are tints of the team color, so they change with it.
        const tints = (calls: string[]) => calls.filter((c) => c.startsWith('fill ')).slice(0, 14);
        expect(tints(red)).not.toEqual(tints(blue));
    });

    it('farm, fabricator and power plant stand on the 7 hexes they cover, and no wider', () => {
        // The footprint is a hex and its six neighbors: its widest points are 48 + 32 = 80 px out.
        for (const type of ['farm', 'fabricator', 'power'] as const) {
            const { points } = draw(type);
            const wide = Math.max(...points.map((p) => Math.abs(p.x - ART_CANVAS.originX)));
            expect(wide, type).toBeGreaterThan(78);
            expect(wide, type).toBeLessThanOrEqual(82);
        }
    });

    it("the 7-hex pad's centers are the middle hex and its six real neighbors", () => {
        expect(SEVEN_HEX_CENTERS).toHaveLength(7);
        const middle = hexCenter(10, 10);
        const neighbors = hexNeighbors(10, 10).map((h) => {
            const c = hexCenter(h.col, h.row);
            return { x: c.x - middle.x, y: c.y - middle.y };
        });
        for (const n of neighbors) {
            expect(
                SEVEN_HEX_CENTERS.slice(1).some((c) => Math.hypot(c.x - n.x, c.y - n.y) < 0.01)
            ).toBe(true);
        }
        expect(SEVEN_HEX_CENTERS[0]).toEqual({ x: 0, y: 0 });
    });

    it('every pad is in the owner color: no flat concrete left', () => {
        const slate = (0x5d5a55).toString(16);
        for (const type of STRUCTURE_TYPES) {
            const red = draw(type, RED).calls;
            const blue = draw(type, BLUE).calls;
            expect(
                red.some((c) => c.startsWith(`fill ${slate}`)),
                type
            ).toBe(false);
            const first = (calls: string[]) =>
                calls.filter((c) => c.startsWith('fill ')).slice(0, 14);
            expect(first(red), type).not.toEqual(first(blue));
        }
    });

    it('the stacks reach the point the smoke starts from', () => {
        const topOfDrawing = Math.min(...draw('power').points.map((p) => p.y)) - ART_CANVAS.originY;
        const highestSource = Math.min(...smokeSources('power').map((s) => s.y));
        expect(highestSource).toBeGreaterThanOrEqual(topOfDrawing - 1);
        expect(highestSource).toBeLessThan(topOfDrawing + 6);
    });
});

describe('texture keys and baking', () => {
    it('are the same for the same art and different otherwise', () => {
        expect(structureTextureKey('farm', RED)).toBe(structureTextureKey('farm', RED));
        expect(structureTextureKey('farm', RED)).not.toBe(structureTextureKey('farm', BLUE));
        expect(structureTextureKey('farm', RED)).not.toBe(structureTextureKey('power', RED));
        const a = structureTextureKey('guardTower', RED, towerHexes());
        const b = structureTextureKey('guardTower', RED, [{ x: 0, y: 0 }]);
        expect(a).not.toBe(b);
    });

    it('bakes a structure once and reuses the texture', () => {
        const existing = new Set<string>();
        const generate = vi.fn((key: string) => existing.add(key));
        const scene = {
            textures: { exists: (key: string) => existing.has(key) },
            make: {
                graphics: () => ({
                    ...recorder().brush,
                    generateTexture: generate,
                    destroy: vi.fn(),
                }),
            },
        };
        const key = bakeStructure(scene as never, 'fabricator', RED);
        expect(generate).toHaveBeenCalledWith(key, ART_CANVAS.width, ART_CANVAS.height);
        expect(bakeStructure(scene as never, 'fabricator', RED)).toBe(key);
        expect(generate).toHaveBeenCalledTimes(1);
        bakeStructure(scene as never, 'fabricator', BLUE);
        expect(generate).toHaveBeenCalledTimes(2);
    });
});

describe('domePanels (the farm)', () => {
    const panels = domePanels(DOME_RADIUS, DOME_HEIGHT);
    const centerOf = (p: (typeof panels)[number]) => [
        p.corners.reduce((s, c) => s + c[0], 0) / p.corners.length,
        p.corners.reduce((s, c) => s + c[1], 0) / p.corners.length,
    ];

    it('is a honeycomb of a few dozen hexagon panels, a few of them solar', () => {
        expect(panels.length).toBeGreaterThan(40);
        expect(panels.length).toBeLessThan(160);
        const solar = panels.filter((p) => p.kind === 'solar').length;
        expect(solar).toBeGreaterThan(panels.length * 0.05);
        expect(solar).toBeLessThan(panels.length * 0.25);
        expect(panels.filter((p) => p.kind === 'glass').length).toBeGreaterThan(solar);
    });

    it('cuts every edge in two, so each hexagon has 12 points', () => {
        for (const p of panels) expect(p.corners).toHaveLength(12);
    });

    it('has a clear glass hexagon at the very top, flat and facing up', () => {
        const top = panels.reduce((best, p) => (p.normal[2] > best.normal[2] ? p : best));
        expect(top.normal[2]).toBeGreaterThan(0.99);
        expect(top.kind).toBe('glass');
        expect(Math.min(...top.corners.map((c) => c[2]))).toBeGreaterThan(DOME_HEIGHT * 0.95);
    });

    it('tiles without gaps: inside the dome every corner is shared by exactly three panels', () => {
        const uses = new Map<string, number>();
        const key = (c: readonly number[]) => c.map((v) => v.toFixed(4)).join(',');
        for (const p of panels) {
            // Even points are the hexagon's own corners; odd ones are the midpoints of its edges.
            p.corners.forEach((c, i) => {
                if (i % 2 === 0) uses.set(key(c), (uses.get(key(c)) ?? 0) + 1);
            });
        }
        const inside = panels.filter((p) => p.normal[2] > 0.55);
        expect(inside.length).toBeGreaterThan(10);
        for (const p of inside) {
            p.corners.forEach((c, i) => {
                if (i % 2 === 0) expect(uses.get(key(c))).toBe(3);
            });
        }
    });

    it('lies on the dome: every point is on the ellipsoid, above the base', () => {
        for (const p of panels) {
            for (const [x, y, z] of p.corners) {
                expect(z).toBeGreaterThanOrEqual(-1e-6);
                const r = (x / DOME_RADIUS) ** 2 + (y / DOME_RADIUS) ** 2 + (z / DOME_HEIGHT) ** 2;
                expect(r).toBeCloseTo(1, 5);
            }
        }
    });

    it('has unit normals pointing outward and up, and none pointing into the dome', () => {
        for (const p of panels) {
            expect(Math.hypot(...p.normal)).toBeCloseTo(1, 5);
            expect(p.normal[2]).toBeGreaterThanOrEqual(-1e-6);
            const [cx, cy] = centerOf(p);
            expect(p.normal[0] * cx + p.normal[1] * cy).toBeGreaterThanOrEqual(-0.5);
        }
    });

    it('panels get smaller toward the rim (an equidistant map of the dome)', () => {
        const size = (p: (typeof panels)[number]) => {
            const xs = p.corners.map((c) => c[0]);
            const ys = p.corners.map((c) => c[1]);
            return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
        };
        const centre = panels.filter((p) => p.normal[2] > 0.9);
        const rim = panels.filter((p) => p.normal[2] < 0.45 && p.normal[2] > 0.1);
        expect(centre.length).toBeGreaterThan(0);
        expect(rim.length).toBeGreaterThan(0);
        const mean = (list: typeof panels) => list.reduce((s, p) => s + size(p), 0) / list.length;
        expect(mean(centre)).toBeGreaterThan(mean(rim));
    });

    it('is the same every time', () => {
        expect(domePanels(DOME_RADIUS, DOME_HEIGHT)).toEqual(panels);
    });
});

/** A scene with just what SmokeEmitter uses, counting what it makes. */
function fakeScene() {
    const images: Array<{ destroyed: boolean; x: number; y: number }> = [];
    const tweens: Array<{ config: Record<string, unknown> }> = [];
    let tick: (() => void) | undefined;
    const removed = vi.fn();
    const scene = {
        textures: { exists: (key: string) => key === SMOKE_KEY },
        make: {
            graphics: () => ({ ...recorder().brush, generateTexture: vi.fn(), destroy: vi.fn() }),
        },
        add: {
            image: (x: number, y: number) => {
                const image = {
                    destroyed: false,
                    x,
                    y,
                    angle: 0,
                    setDepth: () => image,
                    setAlpha: () => image,
                    setScale: () => image,
                    setAngle: () => image,
                    setTint: () => image,
                    destroy: () => (image.destroyed = true),
                };
                images.push(image);
                return image;
            },
        },
        tweens: {
            add: (config: Record<string, unknown>) => tweens.push({ config }),
            killTweensOf: vi.fn(),
        },
        time: {
            addEvent: (config: { callback: () => void }) => {
                tick = config.callback;
                return { remove: removed };
            },
        },
    };
    return { scene, images, tweens, removed, step: () => tick?.() };
}

describe('SmokeEmitter', () => {
    const sources = [
        { x: 20, y: -60 },
        { x: 30, y: -50 },
    ];

    it('releases a puff from one stack, then the other, then the first again', () => {
        const { scene, images, step } = fakeScene();
        new SmokeEmitter(scene as never, sources, 100, 200, 5, 1);
        step();
        expect(images).toHaveLength(1);
        expect(images[0]).toMatchObject({ x: 120, y: 140 });
        step();
        expect(images).toHaveLength(2);
        expect(images[1]).toMatchObject({ x: 130, y: 150 });
        step();
        expect(images).toHaveLength(3);
        expect(images[2]).toMatchObject({ x: 120, y: 140 });
    });

    it('lets each puff rise, billow and fade, then removes it', () => {
        const { scene, tweens, images, step } = fakeScene();
        new SmokeEmitter(scene as never, sources, 0, 0, 5, 1);
        step();
        const config = tweens[0].config as {
            y: number;
            scale: number;
            alpha: { from: number; to: number };
            onComplete: () => void;
        };
        expect(config.y).toBeLessThan(images[0].y - 50);
        expect(config.scale).toBeGreaterThan(1);
        expect(config.alpha.to).toBe(0);
        config.onComplete();
        expect(images[0].destroyed).toBe(true);
    });

    it('destroy stops the timer and clears the puffs still in the air', () => {
        const { scene, images, removed, step } = fakeScene();
        const smoke = new SmokeEmitter(scene as never, sources, 0, 0, 5, 1);
        step();
        step();
        smoke.destroy();
        expect(removed).toHaveBeenCalled();
        expect(images.every((i) => i.destroyed)).toBe(true);
    });

    it('puffs about every SMOKE_EVERY_MS per stack', () => {
        expect(SMOKE_EVERY_MS).toBeGreaterThan(200);
        expect(SMOKE_EVERY_MS).toBeLessThan(1000);
    });
});
