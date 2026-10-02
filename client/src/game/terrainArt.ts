// How terrain looks: the mountain sprites and the water details, drawn with vector graphics (no
// image files yet). The geometry here is plain math, kept apart from Phaser so it can be unit-tested;
// GameScene bakes the results (mountains into one texture each, water into the base terrain layer).
//
// All points are in scene space: the isometric view of the map (x as in the world, y squashed by
// ISO_SQUASH), with y down. Heights are screen px straight up.

import type Phaser from 'phaser';
import type { TerrainPalette } from './terrainPalettes';

export interface Pt {
    x: number;
    y: number;
}

// --- Look -------------------------------------------------------------------------------------
// The colors come from the match's palette (terrainPalettes.ts: Slate or Titan); the shapes are the
// same for every palette.

// Peak heights (screen px): a small (3-hex) mountain and a large (7-hex) one.
export const SMALL_PEAK_HEIGHT = 62;
export const LARGE_PEAK_HEIGHT = 108;
// The share of a peak's height above which it's snow (varied a little per facet).
export const SNOW_LINE = 0.6;
// Light from the upper left, a little from behind: (x right, y toward the viewer, z up).
const LIGHT = normalize({ x: -0.6, y: -0.35, z: 0.72 });
// Sky-reflection patches on deep liquid: how big (scene px).
const REFLECTION_SCALE = 180;
// How far the liquid's surface sits below the ground: the bank shown along a shore at the back of a
// water hex (screen px).
export const DEEP_BANK_HEIGHT = 7;
export const SHALLOW_BANK_HEIGHT = 4;

// --- Randomness -------------------------------------------------------------------------------

/** A small seeded random number generator (mulberry32): the same seed, the same numbers. */
export function seededRandom(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** A well-mixed integer from a hex index (so neighboring hexes look unrelated). */
export function hexSeed(index: number, salt = 0): number {
    let h = (index + 1) * 0x9e3779b1 + salt * 0x85ebca6b;
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    return (h ^ (h >>> 16)) >>> 0;
}

// --- Colors -----------------------------------------------------------------------------------

/** The color `t` (0..1) of the way from `a` to `b`. */
export function mixColor(a: number, b: number, t: number): number {
    const k = Math.max(0, Math.min(1, t));
    const ch = (c: number, shift: number) => (c >> shift) & 0xff;
    const mix = (shift: number) => Math.round(ch(a, shift) + (ch(b, shift) - ch(a, shift)) * k);
    return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

/** Shade between `dark`, `mid` and `light` for a brightness 0..1. */
function shade(dark: number, mid: number, light: number, brightness: number): number {
    return brightness < 0.5
        ? mixColor(dark, mid, brightness * 2)
        : mixColor(mid, light, (brightness - 0.5) * 2);
}

// --- Geometry ---------------------------------------------------------------------------------

interface Vec3 {
    x: number;
    y: number;
    z: number;
}

function normalize(v: Vec3): Vec3 {
    const length = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / length, y: v.y / length, z: v.z / length };
}

/** The convex hull of `points` (Andrew's monotone chain), in order around it. */
export function convexHull(points: readonly Pt[]): Pt[] {
    const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
    if (sorted.length < 3) return sorted;
    const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower: Pt[] = [];
    for (const p of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
            lower.pop();
        lower.push(p);
    }
    const upper: Pt[] = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
        const p = sorted[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
            upper.pop();
        upper.push(p);
    }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** A point of the mountain: where it stands on the ground (scene px) and how high it is. */
interface MountainPoint {
    x: number;
    gy: number; // ground y, scene px
    z: number; // height, screen px
}

export interface Facet {
    points: Pt[]; // on screen (scene px)
    color: number;
    depth: number; // for drawing back to front
    snow: boolean; // part of the frost cap (else rock)
}

export interface MountainModel {
    seed: number; // for its texture (drawMountain)
    facets: Facet[]; // back to front
    shadow: { x: number; y: number; width: number; height: number }; // an ellipse on the ground
    anchor: Pt; // the middle of its footprint on the ground: where it sorts against players
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

/** Splits a polygon by height: the part below `z` and the part above it. */
function splitAtHeight(
    polygon: MountainPoint[],
    z: number
): { below: MountainPoint[]; above: MountainPoint[] } {
    const below: MountainPoint[] = [];
    const above: MountainPoint[] = [];
    for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        (a.z <= z ? below : above).push(a);
        if (a.z <= z !== b.z <= z) {
            const t = (z - a.z) / (b.z - a.z);
            const cut = { x: a.x + (b.x - a.x) * t, gy: a.gy + (b.gy - a.gy) * t, z };
            below.push(cut);
            above.push(cut);
        }
    }
    return { below, above };
}

/**
 * A mountain standing on the hexes whose (projected) corners are `corners` and centers `centers`:
 * a faceted peak over their outline, lit from the upper left, snow on top. `large` is the 7-hex
 * mountain (taller, with two ridge rings); `seed` varies its shape. `squash` is ISO_SQUASH, used
 * to light it as the 3D shape it stands for; `palette` colors its rock and snow.
 */
export function mountainModel(
    corners: readonly Pt[],
    centers: readonly Pt[],
    large: boolean,
    seed: number,
    squash: number,
    palette: TerrainPalette
): MountainModel {
    const { rock: rockColors, snow } = palette;
    const random = seededRandom(seed);
    const jitter = (amount: number) => (random() * 2 - 1) * amount;
    const anchor = {
        x: centers.reduce((sum, c) => sum + c.x, 0) / centers.length,
        y: centers.reduce((sum, c) => sum + c.y, 0) / centers.length,
    };

    // The base: the outline's convex hull, pulled in a little so it doesn't spill onto neighbors,
    // with long edges broken up so the foot isn't a clean polygon.
    const hull = convexHull(corners).map((p) => ({
        x: anchor.x + (p.x - anchor.x) * 0.9,
        y: anchor.y + (p.y - anchor.y) * 0.9,
    }));
    const base: MountainPoint[] = [];
    hull.forEach((a, i) => {
        const b = hull[(i + 1) % hull.length];
        const steps = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 26));
        for (let k = 0; k < steps; k++) {
            const t = k / steps;
            const pull = k === 0 ? 1 : 0.94 + random() * 0.1;
            base.push({
                x: anchor.x + (a.x + (b.x - a.x) * t - anchor.x) * pull,
                gy: anchor.y + (a.y + (b.y - a.y) * t - anchor.y) * pull,
                z: random() * 3,
            });
        }
    });

    // The peak, off-center a little, then one or two rings of ridge points between it and the base,
    // at uneven heights: shoulders and sub-peaks rather than a tent.
    const height = (large ? LARGE_PEAK_HEIGHT : SMALL_PEAK_HEIGHT) * (0.9 + random() * 0.2);
    const width = Math.max(...base.map((p) => p.x)) - Math.min(...base.map((p) => p.x));
    const peak: MountainPoint = {
        x: anchor.x + jitter(width * 0.14),
        gy: anchor.y + jitter(4),
        z: height,
    };
    const ringAt = (share: number, rise: number, spread: number) =>
        base.map((p) => {
            const t = share + jitter(0.1);
            return {
                x: p.x + (peak.x - p.x) * t + jitter(spread),
                gy: p.gy + (peak.gy - p.gy) * t + jitter(spread * 0.6),
                z: height * Math.max(0.05, rise + jitter(0.18)),
            };
        });
    const rings = large
        ? [base, ringAt(0.36, 0.34, 7), ringAt(0.68, 0.68, 6)]
        : [base, ringAt(0.5, 0.46, 5)];
    // A large mountain gets a second, lower summit on its top ring.
    if (large) {
        const top = rings[rings.length - 1];
        top[Math.floor(random() * top.length)].z = height * (0.8 + random() * 0.1);
    }

    // Triangles between neighboring rings, and from the top ring to the peak.
    const triangles: MountainPoint[][] = [];
    for (let r = 0; r + 1 < rings.length; r++) {
        const lower = rings[r];
        const upper = rings[r + 1];
        for (let i = 0; i < lower.length; i++) {
            const j = (i + 1) % lower.length;
            triangles.push([lower[i], lower[j], upper[j]], [lower[i], upper[j], upper[i]]);
        }
    }
    const top = rings[rings.length - 1];
    top.forEach((p, i) => triangles.push([p, top[(i + 1) % top.length], peak]));

    // Light each triangle as the 3D surface it is (ground y back into world y), and split off the
    // part above its snow line.
    const toScreen = (p: MountainPoint): Pt => ({ x: p.x, y: p.gy - p.z });
    const facets: Facet[] = [];
    for (const tri of triangles) {
        const [a, b, c] = tri.map((p) => ({ x: p.x, y: p.gy / squash, z: p.z }));
        const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
        const v = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
        let normal = normalize({
            x: u.y * v.z - u.z * v.y,
            y: u.z * v.x - u.x * v.z,
            z: u.x * v.y - u.y * v.x,
        });
        if (normal.z < 0) normal = { x: -normal.x, y: -normal.y, z: -normal.z };
        const lit = normal.x * LIGHT.x + normal.y * LIGHT.y + normal.z * LIGHT.z;
        // Strong light and shade, and a little noise per facet so the rock looks broken, not smooth.
        const brightness = Math.max(0, Math.min(1, 0.02 + 1.12 * Math.max(0, lit) + jitter(0.06)));
        const depth = (tri[0].gy + tri[1].gy + tri[2].gy) / 3;
        const snowLine = height * (SNOW_LINE + jitter(0.07));
        const { below, above } = splitAtHeight(tri, snowLine);
        if (below.length >= 3) {
            // The lower slopes carry some of the plains' dust.
            const low = 1 - below.reduce((sum, p) => sum + p.z, 0) / below.length / height;
            const rock = shade(rockColors.shadow, rockColors.mid, rockColors.light, brightness);
            const dust = ramp(low, 0.55, 1) * rockColors.slopeDustAmount;
            facets.push({
                points: below.map(toScreen),
                color: mixColor(rock, rockColors.slopeDust, dust),
                depth,
                snow: false,
            });
        }
        if (above.length >= 3) {
            facets.push({
                points: above.map(toScreen),
                color: shade(
                    snow.shadow,
                    mixColor(snow.shadow, snow.light, 0.6),
                    snow.light,
                    brightness
                ),
                depth: depth + 0.001, // just after its rock, which it sits on
                snow: true,
            });
        }
    }
    // Back to front, so the near slopes cover the far ones (a heightfield seen from the front).
    facets.sort((f, g) => f.depth - g.depth);

    const baseXs = base.map((p) => p.x);
    const baseYs = base.map((p) => p.gy);
    const shadow = {
        x: anchor.x + width * 0.12,
        y: anchor.y + 3,
        width: width * 1.08,
        height: (Math.max(...baseYs) - Math.min(...baseYs)) * 1.05,
    };
    const xs = [
        ...facets.flatMap((f) => f.points.map((p) => p.x)),
        shadow.x - shadow.width / 2,
        shadow.x + shadow.width / 2,
        ...baseXs,
    ];
    const ys = [
        ...facets.flatMap((f) => f.points.map((p) => p.y)),
        shadow.y + shadow.height / 2,
        ...baseYs,
    ];
    return {
        seed,
        facets,
        shadow,
        anchor,
        bounds: {
            minX: Math.min(...xs),
            minY: Math.min(...ys),
            maxX: Math.max(...xs),
            maxY: Math.max(...ys),
        },
    };
}

/** Draws a mountain model into `g`, shifted by (dx, dy), its texture in `palette`'s colors. */
export function drawMountain(
    g: Phaser.GameObjects.Graphics,
    model: MountainModel,
    dx: number,
    dy: number,
    palette: TerrainPalette
): void {
    const { shadow } = model;
    const random = seededRandom(model.seed ^ 0x5bd1e995);
    g.fillStyle(0x000000, 0.22);
    g.fillEllipse(shadow.x + dx, shadow.y + dy, shadow.width, shadow.height);
    for (const facet of model.facets) {
        const points = facet.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
        g.fillStyle(facet.color, 1);
        g.fillPoints(points as Phaser.Math.Vector2[], true);
        // A hairline in the facet's own color hides the seams between neighboring triangles.
        g.lineStyle(1, facet.color, 1);
        g.strokePoints(points as Phaser.Math.Vector2[], true);
        drawFacetTexture(g, points, facet.snow, random, palette);
    }
}

/** A polygon's area (the shoelace formula). */
function polygonArea(points: readonly Pt[]): number {
    let twice = 0;
    points.forEach((p, i) => {
        const q = points[(i + 1) % points.length];
        twice += p.x * q.y - q.x * p.y;
    });
    return Math.abs(twice) / 2;
}

/** A random point inside a convex polygon (a random blend of its corners). */
function pointInside(points: readonly Pt[], random: () => number): Pt {
    const weights = points.map(() => random() + 0.05);
    const total = weights.reduce((sum, w) => sum + w, 0);
    return {
        x: points.reduce((sum, p, i) => sum + p.x * weights[i], 0) / total,
        y: points.reduce((sum, p, i) => sum + p.y * weights[i], 0) / total,
    };
}

/**
 * The same quiet texture as the ground, on one facet: specks of soot and pale grit (more on bigger
 * facets), and on larger rock facets a faint stratum line across it.
 */
function drawFacetTexture(
    g: Phaser.GameObjects.Graphics,
    points: readonly Pt[],
    snow: boolean,
    random: () => number,
    palette: TerrainPalette
): void {
    const { soot, grit } = palette.rock;
    const area = polygonArea(points);
    const specks = Math.min(7, Math.floor(area / 90));
    for (let k = 0; k < specks; k++) {
        const p = pointInside(points, random);
        const dark = random() < 0.6;
        if (snow) g.fillStyle(palette.snow.shadow, 0.3);
        else g.fillStyle(dark ? soot : grit, dark ? 0.35 : 0.22);
        g.fillCircle(p.x, p.y, 0.6 + random() * 0.8);
    }
    if (!snow && area > 220 && random() < 0.6) {
        const a = pointInside(points, random);
        const b = pointInside(points, random);
        g.lineStyle(1, soot, 0.22);
        g.lineBetween(a.x, a.y, b.x, b.y);
    }
}

// --- Water details ----------------------------------------------------------------------------

/**
 * Ripples for a water hex centered on `center` (scene px): each a low wave ("~") as a polyline of
 * five points. Deep water gets more than shallow.
 */
export function rippleMarks(center: Pt, seed: number, count: number): Pt[][] {
    const random = seededRandom(seed);
    const marks: Pt[][] = [];
    for (let k = 0; k < count; k++) {
        const x = center.x + (random() * 2 - 1) * 16;
        const y = center.y + (random() * 2 - 1) * 8;
        const half = 6 + random() * 5;
        const lift = 0.8 + random() * 0.6;
        marks.push(
            [-1, -0.5, 0, 0.5, 1].map((t, i) => ({
                x: x + t * half,
                y: y + (i % 2 === 1 ? (i === 1 ? -lift : lift) : 0),
            }))
        );
    }
    return marks;
}

/** Pebbles on a shallow water hex's bed: small ellipses (x, y, width, height). */
export function pebbles(center: Pt, seed: number): Array<[number, number, number, number]> {
    const random = seededRandom(seed);
    const count = 3 + Math.floor(random() * 4);
    return Array.from({ length: count }, () => {
        const w = 3 + random() * 5;
        return [
            center.x + (random() * 2 - 1) * 20,
            center.y + (random() * 2 - 1) * 10,
            w,
            w * (0.5 + random() * 0.2),
        ];
    });
}

// --- Ground -----------------------------------------------------------------------------------
// The plains: the palette's base color drifting toward its patch colors in smooth patches spanning
// several hexes (Slate: brown and maroon dust; Titan: tan dunes and charcoal ice rock). Each tile
// gets a subtle texture: pale grains, dark pebbles, accent specks, now and then a hairline crack or a
// patch of frost, and (GameScene) a soft bevel so tiles read as sleek panels.

/** A pseudo-random number in [0, 1) for a lattice point (ix, iy) and a seed. */
function latticeRandom(ix: number, iy: number, seed: number): number {
    return hexSeed(Math.imul(ix, 73856093) ^ Math.imul(iy, 19349663), seed) / 4294967296;
}

/** Smooth value noise in [0, 1): gentle hills of `scale` px, the same for the same seed. */
export function valueNoise(x: number, y: number, scale: number, seed: number): number {
    const fx = x / scale;
    const fy = y / scale;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const smooth = (t: number) => t * t * (3 - 2 * t);
    const tx = smooth(fx - ix);
    const ty = smooth(fy - iy);
    const top = latticeRandom(ix, iy, seed) * (1 - tx) + latticeRandom(ix + 1, iy, seed) * tx;
    const bottom =
        latticeRandom(ix, iy + 1, seed) * (1 - tx) + latticeRandom(ix + 1, iy + 1, seed) * tx;
    return top * (1 - ty) + bottom * ty;
}

/** 0 below `from`, 1 above `to`, a smooth ramp between. */
function ramp(value: number, from: number, to: number): number {
    const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
    return t * t * (3 - 2 * t);
}

/** How much of a ground patch layer lies at `center`, 0..1 (before its `amount`). */
function patchStrength(center: Pt, patch: TerrainPalette['ground']['patches'][number]): number {
    return ramp(valueNoise(center.x, center.y, patch.scale, patch.seed), patch.from, patch.to);
}

/**
 * The top color of a ground hex centered on `center` (scene px): the palette's base color, drifting
 * toward each patch layer's color where it lies (smooth patches spanning several hexes), plus a hint
 * of per-hex variation. `index` is the hex's tile index.
 */
export function groundColor(center: Pt, index: number, palette: TerrainPalette): number {
    let color = palette.ground.base;
    for (const patch of palette.ground.patches) {
        color = mixColor(color, patch.color, patchStrength(center, patch) * patch.amount);
    }
    const tint = seededRandom(hexSeed(index, 13))();
    return tint < 0.5
        ? mixColor(color, 0x000000, (0.5 - tint) * 0.08)
        : mixColor(color, 0xffffff, (tint - 0.5) * 0.05);
}

export interface GroundDetails {
    grains: Array<{ x: number; y: number; r: number; color: number; alpha: number }>;
    cracks: Pt[][];
    frost: Array<{ x: number; y: number; w: number; h: number }>;
}

/**
 * The texture of one ground hex centered on `center`: a few grains (pale, dark, or the palette's
 * accent where its patches lie), sometimes a hairline crack, sometimes a faint patch of frost. All
 * inside the hex's top and all faint, so the ground stays calm. `dust` (0..1) is how much of the
 * patches this hex shows (groundDust), which makes accent grains likelier.
 */
export function groundDetails(
    center: Pt,
    index: number,
    dust: number,
    palette: TerrainPalette
): GroundDetails {
    const { lightGrain, darkGrain, accentGrain } = palette.ground;
    const random = seededRandom(hexSeed(index, 14));
    // A point within the hex top: an ellipse well inside it (the top is ~64 x 33 px on screen).
    const inside = (rx: number, ry: number): Pt => {
        const angle = random() * Math.PI * 2;
        const radius = Math.sqrt(random());
        return {
            x: center.x + Math.cos(angle) * rx * radius,
            y: center.y + Math.sin(angle) * ry * radius,
        };
    };
    const grains: GroundDetails['grains'] = [];
    const count = 4 + Math.floor(random() * 6);
    for (let k = 0; k < count; k++) {
        const p = inside(22, 11);
        const kind = random();
        if (kind < 0.45) {
            grains.push({
                ...p,
                r: 0.7 + random() * 0.6,
                color: lightGrain,
                alpha: 0.12 + random() * 0.1,
            });
        } else if (kind < 0.45 + 0.35 * (0.4 + dust)) {
            grains.push({
                ...p,
                r: 0.9 + random() * 0.9,
                color: accentGrain,
                alpha: 0.25 + random() * 0.15,
            });
        } else {
            grains.push({
                ...p,
                r: 0.8 + random() * 0.8,
                color: darkGrain,
                alpha: 0.2 + random() * 0.15,
            });
        }
    }
    const cracks: Pt[][] = [];
    if (random() < 0.28) {
        let p = inside(14, 7);
        let angle = random() * Math.PI * 2;
        const crack = [p];
        const segments = 2 + Math.floor(random() * 3);
        for (let k = 0; k < segments; k++) {
            angle += (random() * 2 - 1) * 0.9;
            const length = 4 + random() * 5;
            p = { x: p.x + Math.cos(angle) * length, y: p.y + Math.sin(angle) * length * 0.55 };
            crack.push(p);
        }
        cracks.push(crack);
    }
    const frost: GroundDetails['frost'] = [];
    if (random() < 0.14) {
        const p = inside(12, 6);
        frost.push({ ...p, w: 12 + random() * 10, h: 5 + random() * 3 });
    }
    return { grains, cracks, frost };
}

/** How much of the palette's patches the ground shows at `center`, 0..1: for groundDetails. */
export function groundDust(center: Pt, palette: TerrainPalette): number {
    return Math.max(0, ...palette.ground.patches.map((patch) => patchStrength(center, patch)));
}

/**
 * How strongly the deep liquid at `center` mirrors the sky, 0..1: smooth patches across a lake, so
 * it gleams in places rather than tile by tile. (How much that shows is the palette's `deepGleam`;
 * Slate's water doesn't reflect.)
 */
export function skyReflection(center: Pt): number {
    return ramp(valueNoise(center.x, center.y, REFLECTION_SCALE, 21), 0.35, 0.8);
}
