// A tiny 3D drawing kit for the structure art: shapes are described on the ground (world px, x right,
// y toward the viewer) with a height z (screen px straight up), and drawn the way the game's
// isometric view shows them: screen x = x, screen y = y * ISO_SQUASH - z. Faces turned away from the
// viewer are skipped and the rest are lit from the upper left, so a few polygons read as solid.
//
// Everything here is plain math plus calls on a `Brush` (Phaser's Graphics, or a recorder in the
// specs), so it can be unit-tested without a browser.

import { ISO_SQUASH } from '../constants';
import { mixColor, seededRandom } from '../terrainArt';

export { seededRandom };

export interface Pt {
    x: number;
    y: number;
}

export type V3 = readonly [number, number, number];

/**
 * The drawing calls the art uses; a Phaser Graphics has all of them. (Declared with method syntax,
 * so a Graphics, whose polygon calls want Vector2s, still fits: a plain {x, y} is all we pass.)
 */
export interface Brush {
    fillStyle(color: number, alpha?: number): unknown;
    fillPoints(points: Pt[], closeShape?: boolean): unknown;
    lineStyle(width: number, color: number, alpha?: number): unknown;
    strokePoints(points: Pt[], closeShape?: boolean): unknown;
    lineBetween(x1: number, y1: number, x2: number, y2: number): unknown;
    fillEllipse(x: number, y: number, width: number, height: number): unknown;
    strokeEllipse(x: number, y: number, width: number, height: number): unknown;
    fillCircle(x: number, y: number, radius: number): unknown;
    fillRect(x: number, y: number, width: number, height: number): unknown;
}

// The direction the camera looks from: a step toward the viewer (y) of 1 shows the same screen
// shift as a rise of 0.6 (z), so a face is visible when its normal points along (0, 1, ISO_SQUASH).
const VIEW = normalize([0, 1, ISO_SQUASH]);
// The light comes from the upper left, a little toward the viewer, so front walls are lit.
const LIGHT = normalize([-0.5, 0.55, 0.65]);

function normalize(v: readonly number[]): [number, number, number] {
    const length = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / length, v[1] / length, v[2] / length];
}
const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];

/** True if a surface whose outward normal is `normal` faces the viewer. */
export function facesViewer(normal: readonly number[]): boolean {
    return dot(normal, VIEW) > 1e-6;
}

/** How brightly a surface with this outward normal is lit (about 0.45 in shadow to 1.1 in full light). */
export function lightFactor(normal: readonly number[]): number {
    const length = Math.hypot(normal[0], normal[1], normal[2]) || 1;
    const d = dot(normal, LIGHT) / length;
    return 0.5 + 0.6 * Math.max(d, -0.1);
}

/** `color` darkened (factor under 1) or lightened (over 1). */
export function shadeColor(color: number, factor: number): number {
    return factor <= 1 ? mixColor(0x000000, color, factor) : mixColor(color, 0xffffff, factor - 1);
}

/** A regular polygon on the ground: `count` corners around (cx, cy), for cylinders and domes. */
export function ring(cx: number, cy: number, radius: number, count = 18, spin = 0): Pt[] {
    return Array.from({ length: count }, (_, i) => {
        const angle = spin + (i * 2 * Math.PI) / count;
        return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
    });
}

/** A rectangle's corners on the ground. */
export function rect(x0: number, x1: number, y0: number, y1: number): Pt[] {
    return [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x1, y: y1 },
        { x: x0, y: y1 },
    ];
}

export interface Outline {
    width: number;
    color: number;
    alpha?: number;
}

export interface LoftOptions {
    /** The top face's color (default: `color`, lit as a flat top). Pass null to leave it open. */
    top?: number | null;
    alpha?: number;
    outline?: Outline;
    /** Called for each side face drawn (screen corners, outward normal, lighting factor, index). */
    face?: (quad: Pt[], normal: V3, factor: number, index: number) => void;
}

/** A shape drawn on screen: where the structure's center is on the ground, in the canvas. */
export class Canvas3D {
    readonly g: Brush;
    readonly ox: number;
    readonly oy: number;

    constructor(g: Brush, ox: number, oy: number) {
        this.g = g;
        this.ox = ox;
        this.oy = oy;
    }

    /** The screen position of ground point (x, y) at height z. */
    p(x: number, y: number, z = 0): Pt {
        return { x: this.ox + x, y: this.oy + y * ISO_SQUASH - z };
    }

    /** Fills a polygon given in screen space. */
    fill(points: Pt[], color: number, alpha = 1): void {
        this.g.fillStyle(color, alpha);
        this.g.fillPoints(points, true);
    }

    /** Fills a polygon given as 3D points. */
    poly(points: V3[], color: number, alpha = 1, outline?: Outline): void {
        const screen = points.map((q) => this.p(q[0], q[1], q[2]));
        this.fill(screen, color, alpha);
        if (outline) this.stroke(screen, outline);
    }

    stroke(points: Pt[], outline: Outline): void {
        this.g.lineStyle(outline.width, outline.color, outline.alpha ?? 1);
        this.g.strokePoints(points, true);
    }

    /** A straight bar between two 3D points, `width` screen px thick. */
    line(a: V3, b: V3, width: number, color: number, alpha = 1): void {
        const from = this.p(a[0], a[1], a[2]);
        const to = this.p(b[0], b[1], b[2]);
        this.g.lineStyle(width, color, alpha);
        this.g.lineBetween(from.x, from.y, to.x, to.y);
    }

    /** A flat ellipse lying on the ground plane at height z (a circle of `radius` world px). */
    disc(cx: number, cy: number, z: number, radius: number, color: number, alpha = 1): void {
        const at = this.p(cx, cy, z);
        this.g.fillStyle(color, alpha);
        this.g.fillEllipse(at.x, at.y, radius * 2, radius * 2 * ISO_SQUASH);
    }

    /**
     * A solid between a base polygon at height z0 and a top polygon at z1 (same corner count; the
     * same polygon twice makes a prism, a smaller one a frustum). Only side faces turned toward the
     * viewer are drawn, each lit by its own normal, then the top face.
     */
    loft(base: Pt[], top: Pt[], z0: number, z1: number, color: number, o: LoftOptions = {}): void {
        const n = base.length;
        const center: V3 = [
            base.reduce((s, q) => s + q.x, 0) / n,
            base.reduce((s, q) => s + q.y, 0) / n,
            (z0 + z1) / 2,
        ];
        const alpha = o.alpha ?? 1;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            const a0: V3 = [base[i].x, base[i].y, z0];
            const b0: V3 = [base[j].x, base[j].y, z0];
            const a1: V3 = [top[i].x, top[i].y, z1];
            const b1: V3 = [top[j].x, top[j].y, z1];
            let normal = cross(sub(b0, a0), sub(a1, a0));
            const mid: V3 = [(a0[0] + b1[0]) / 2, (a0[1] + b1[1]) / 2, (a0[2] + b1[2]) / 2];
            if (dot(normal, sub(mid, center)) < 0) normal = [-normal[0], -normal[1], -normal[2]];
            if (!facesViewer(normal)) continue;
            const factor = lightFactor(normal);
            const quad = [this.p(...a0), this.p(...b0), this.p(...b1), this.p(...a1)];
            this.fill(quad, shadeColor(color, factor), alpha);
            if (o.outline) this.stroke(quad, o.outline);
            o.face?.(quad, normal, factor, i);
        }
        if (o.top !== null) {
            const face = top.map((q) => this.p(q.x, q.y, z1));
            this.fill(face, o.top ?? shadeColor(color, lightFactor([0, 0, 1])), alpha);
            if (o.outline) this.stroke(face, o.outline);
        }
    }

    prism(ground: Pt[], z0: number, z1: number, color: number, o: LoftOptions = {}): void {
        this.loft(ground, ground, z0, z1, color, o);
    }

    box(
        x0: number,
        x1: number,
        y0: number,
        y1: number,
        z0: number,
        z1: number,
        color: number,
        o: LoftOptions = {}
    ): void {
        this.prism(rect(x0, x1, y0, y1), z0, z1, color, o);
    }

    /** A cylinder (or, with different radii, a cone or a tapering stack) standing on the ground. */
    cylinder(
        cx: number,
        cy: number,
        r0: number,
        r1: number,
        z0: number,
        z1: number,
        color: number,
        o: LoftOptions = {},
        sides = 18
    ): void {
        this.loft(ring(cx, cy, r0, sides), ring(cx, cy, r1, sides), z0, z1, color, o);
    }

    /** A wall facing the viewer: the rectangle from x0 to x1, z0 to z1, in the plane y. */
    frontWall(
        x0: number,
        x1: number,
        y: number,
        z0: number,
        z1: number,
        color: number,
        alpha = 1
    ): Pt[] {
        const quad = [this.p(x0, y, z1), this.p(x1, y, z1), this.p(x1, y, z0), this.p(x0, y, z0)];
        this.fill(quad, shadeColor(color, lightFactor([0, 1, 0])), alpha);
        return quad;
    }

    /** `count` small specks scattered over a polygon's bounding box (deterministic for `random`). */
    speckle(
        quad: Pt[],
        random: () => number,
        count: number,
        colors: number[],
        alpha: number,
        size = 1
    ): void {
        const xs = quad.map((q) => q.x);
        const ys = quad.map((q) => q.y);
        const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
        const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
        for (let k = 0; k < count; k++) {
            const x = x0 + random() * (x1 - x0);
            const y = y0 + random() * (y1 - y0);
            if (!insideConvex(quad, x, y)) continue;
            this.g.fillStyle(colors[Math.floor(random() * colors.length)], alpha);
            this.g.fillRect(x, y, size, size);
        }
    }
}

/** True if (x, y) is inside the convex polygon `points` (either winding). */
export function insideConvex(points: readonly Pt[], x: number, y: number): boolean {
    let sign = 0;
    for (let i = 0; i < points.length; i++) {
        const a = points[i];
        const b = points[(i + 1) % points.length];
        const side = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x);
        if (Math.abs(side) < 1e-9) continue;
        if (sign === 0) sign = Math.sign(side);
        else if (Math.sign(side) !== sign) return false;
    }
    return true;
}
