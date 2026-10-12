// A posing kit for the character art. A character is built from solids in its own frame (u to its
// right, v ahead of it, z up, in px) and turned to face any direction on the ground; the solids are
// then drawn back to front with the structure art's Canvas3D, so one model gives every direction.
//
// Like the structure art this is plain math over a `Brush`, so the specs and the sheet tool can run
// it without Phaser.

import { ISO_SQUASH } from '../constants';
import {
    Canvas3D,
    facesViewer,
    lightFactor,
    shadeColor,
    type Brush,
    type Pt,
    type V3,
} from '../structures/canvas';

/** A ring's size: a radius, or [half-width across u, half-depth along v] for an oval. */
export type Radii = number | readonly [number, number];

export interface SolidStyle {
    /** Draw order nudge: a higher value is drawn later (nearer the viewer) than its depth says. */
    bias?: number;
    alpha?: number;
    /** False to leave off the dark outline. */
    outline?: boolean;
    sides?: number;
}

const OUTLINE_WIDTH = 0.8;
/** How much bigger than the measurements in the art a character is drawn (they're laid out in "model px"). */
export const MODEL_SCALE = 1.25;

const asPair = (r: Radii): [number, number] => (typeof r === 'number' ? [r, r] : [r[0], r[1]]);

export class Rig {
    private readonly parts: { depth: number; draw: () => void }[] = [];
    // The character's forward (fx, fy) and right (rx, ry) on the ground.
    private readonly fx: number;
    private readonly fy: number;
    private readonly rx: number;
    private readonly ry: number;

    readonly canvas: Canvas3D;
    readonly yaw: number;
    readonly lift: number;
    /** A muted rig takes the same calls but draws nothing: a layer that isn't being drawn now. */
    readonly muted: boolean;

    /** `lift`: how far the whole character floats above the ground (the Jetpack's hover). */
    constructor(canvas: Canvas3D, yaw: number, lift = 0, muted = false) {
        this.canvas = canvas;
        this.yaw = yaw;
        this.lift = lift;
        this.muted = muted;
        this.fx = Math.cos(yaw);
        this.fy = Math.sin(yaw);
        this.rx = -Math.sin(yaw);
        this.ry = Math.cos(yaw);
    }

    /** How much the character faces the viewer: 1 straight at the camera, -1 straight away. */
    get front(): number {
        return this.fy;
    }

    /** Local (u, v) to the ground point it lands on, relative to the character's feet. */
    ground(u: number, v: number): Pt {
        return {
            x: (u * this.rx + v * this.fx) * MODEL_SCALE,
            y: (u * this.ry + v * this.fy) * MODEL_SCALE,
        };
    }

    /** A local height in world px (scaled, and lifted off the ground by a Jetpack). */
    height(z: number): number {
        return z * MODEL_SCALE + this.lift;
    }

    /** A local point in world space. */
    world(p: V3): V3 {
        const g = this.ground(p[0], p[1]);
        return [g.x, g.y, this.height(p[2])];
    }

    private queue(center: V3, draw: () => void, bias = 0): void {
        if (this.muted) return;
        const w = this.world(center);
        this.parts.push({ depth: w[1] + ISO_SQUASH * w[2] + bias, draw });
    }

    private outlineOf(color: number, style: SolidStyle) {
        return style.outline === false
            ? undefined
            : { width: OUTLINE_WIDTH, color: shadeColor(color, 0.3), alpha: style.alpha ?? 1 };
    }

    private ringPoints(u: number, v: number, radii: Radii, sides: number): Pt[] {
        const [ru, rv] = asPair(radii);
        return Array.from({ length: sides }, (_, i) => {
            const a = (i * 2 * Math.PI) / sides;
            return this.ground(u + ru * Math.cos(a), v + rv * Math.sin(a));
        });
    }

    /** A straight-sided solid between two rings: a limb, a cylinder, a cone. */
    tube(
        a: V3,
        b: V3,
        ra: Radii,
        rb: Radii,
        color: number,
        style: SolidStyle = {},
        top: number | null | undefined = undefined
    ): void {
        const [low, high] = a[2] <= b[2] ? [a, b] : [b, a];
        const [rLow, rHigh] = a[2] <= b[2] ? [ra, rb] : [rb, ra];
        const sides = style.sides ?? 10;
        const base = this.ringPoints(low[0], low[1], rLow, sides);
        const cap = this.ringPoints(high[0], high[1], rHigh, sides);
        const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        const halo = style.outline === false ? null : shadeColor(color, 0.28);
        this.queue(
            mid,
            () => {
                if (halo !== null) {
                    // The outline is a darker, slightly bigger copy underneath: a ring of outlined
                    // faces would draw a stripe down every facet.
                    const g = (r: Radii): [number, number] => {
                        const [ru, rv] = asPair(r);
                        return [ru + 0.6, rv + 0.6];
                    };
                    this.canvas.loft(
                        this.ringPoints(low[0], low[1], g(rLow), sides),
                        this.ringPoints(high[0], high[1], g(rHigh), sides),
                        this.height(low[2] - 0.5),
                        this.height(high[2] + 0.5),
                        halo,
                        { alpha: style.alpha }
                    );
                }
                this.canvas.loft(base, cap, this.height(low[2]), this.height(high[2]), color, {
                    alpha: style.alpha,
                    top,
                });
            },
            style.bias
        );
    }

    /** An upright cylinder standing at (u, v) from z0 to z1. */
    cyl(
        u: number,
        v: number,
        r0: Radii,
        r1: Radii,
        z0: number,
        z1: number,
        color: number,
        style: SolidStyle = {}
    ): void {
        this.tube([u, v, z0], [u, v, z1], r0, r1, color, style);
    }

    /** A box from (u0, v0, z0) to (u1, v1, z1); `taper` pulls the top face in by that much. */
    box(
        u0: number,
        u1: number,
        v0: number,
        v1: number,
        z0: number,
        z1: number,
        color: number,
        style: SolidStyle & { taper?: number } = {}
    ): void {
        const t = style.taper ?? 0;
        const corners = (a: number, b: number, c: number, d: number) => [
            this.ground(a, c),
            this.ground(b, c),
            this.ground(b, d),
            this.ground(a, d),
        ];
        const base = corners(u0, u1, v0, v1);
        const cap = corners(u0 + t, u1 - t, v0 + t, v1 - t);
        this.queue(
            [(u0 + u1) / 2, (v0 + v1) / 2, (z0 + z1) / 2],
            () =>
                this.canvas.loft(base, cap, this.height(z0), this.height(z1), color, {
                    alpha: style.alpha,
                    outline: this.outlineOf(color, style),
                }),
            style.bias
        );
    }

    /**
     * A rounded solid (a helmet, a shoulder, a glove): a stack of rings, widest at height z. The
     * lower part is cut off at `floor` (-1 at the pole, 0 at the middle). A dark copy a little larger
     * goes under it, which gives it an outline.
     */
    blob(
        center: V3,
        ru: number,
        rv: number,
        rz: number,
        color: number,
        style: SolidStyle & { floor?: number; bands?: number; rim?: number } = {}
    ): void {
        const sides = style.sides ?? 12;
        const bands = style.bands ?? 5;
        const floor = Math.asin(Math.max(-1, Math.min(1, style.floor ?? -0.45)));
        const draw = (grow: number, shade: number, flat?: number) => {
            for (let i = 0; i < bands; i++) {
                const l0 = floor + ((Math.PI / 2 - floor) * i) / bands;
                const l1 = floor + ((Math.PI / 2 - floor) * (i + 1)) / bands;
                const ring = (l: number) =>
                    this.ringPoints(
                        center[0],
                        center[1],
                        [
                            (ru + grow) * Math.max(Math.cos(l), 0.001),
                            (rv + grow) * Math.max(Math.cos(l), 0.001),
                        ],
                        sides
                    );
                const z0 = this.height(center[2] + (rz + grow) * Math.sin(l0));
                const z1 = this.height(center[2] + (rz + grow) * Math.sin(l1));
                this.canvas.loft(
                    ring(l0),
                    ring(l1),
                    z0,
                    z1,
                    flat ?? (shade < 1 ? shadeColor(color, shade) : color),
                    {
                        alpha: style.alpha,
                        top: i === bands - 1 ? undefined : null,
                    }
                );
            }
        };
        this.queue(
            center,
            () => {
                if (style.outline !== false) draw(0.7, 0.28, style.rim);
                draw(0, 1);
            },
            style.bias
        );
    }

    /** A flat piece on a surface: shown only when its outward `normal` (local) faces the viewer. */
    plate(corners: readonly V3[], normal: V3, color: number, style: SolidStyle = {}): void {
        const flat: V3 = [
            normal[0] * this.rx + normal[1] * this.fx,
            normal[0] * this.ry + normal[1] * this.fy,
            normal[2],
        ];
        if (!facesViewer(flat)) return;
        const center = corners
            .reduce<V3>((s, c) => [s[0] + c[0], s[1] + c[1], s[2] + c[2]], [0, 0, 0])
            .map((x) => x / corners.length) as unknown as V3;
        const shaded = shadeColor(color, lightFactor(flat));
        this.queue(
            center,
            () => {
                const points = corners.map((c) => this.world(c));
                this.canvas.poly(points, shaded, style.alpha ?? 1, this.outlineOf(color, style));
            },
            style.bias ?? 0.4
        );
    }

    /** A rounded bar between two points (a hose, a shaft, a bedroll): drawn as a thick line. */
    rod(a: V3, b: V3, radius: number, color: number, style: SolidStyle = {}): void {
        const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
        this.queue(
            mid,
            () => {
                const p = this.canvas.p(...this.world(a));
                const q = this.canvas.p(...this.world(b));
                const g: Brush = this.canvas.g;
                const alpha = style.alpha ?? 1;
                const dark = shadeColor(color, 0.3);
                const r = radius * MODEL_SCALE;
                const stroke = (w: number, c: number, dy: number, a2 = alpha) => {
                    g.lineStyle(w, c, a2);
                    g.lineBetween(p.x, p.y + dy, q.x, q.y + dy);
                    g.fillStyle(c, a2);
                    g.fillCircle(p.x, p.y + dy, w / 2);
                    g.fillCircle(q.x, q.y + dy, w / 2);
                };
                if (style.outline !== false) stroke(r * 2 + OUTLINE_WIDTH * 2, dark, 0);
                stroke(r * 2, shadeColor(color, 0.85), 0);
                stroke(r * 1.2, shadeColor(color, 1.15), -r * 0.3);
            },
            style.bias
        );
    }

    /** A flat ellipse of light or paint lying at height z (a glow, a lens), drawn at its height. */
    glow(center: V3, radius: number, color: number, alpha = 1, style: SolidStyle = {}): void {
        this.queue(
            center,
            () => {
                const p = this.canvas.p(...this.world(center));
                this.canvas.g.fillStyle(color, alpha);
                this.canvas.g.fillEllipse(
                    p.x,
                    p.y,
                    radius * 2 * MODEL_SCALE,
                    radius * 1.7 * MODEL_SCALE
                );
            },
            style.bias ?? 0.5
        );
    }

    /** The soft shadow on the ground under the character (drawn before everything else). */
    shadow(radius: number, alpha = 0.32): void {
        if (this.muted) return;
        this.canvas.disc(0, 0, 0, radius * MODEL_SCALE, 0x000000, alpha);
        this.canvas.disc(0, 0, 0, radius * MODEL_SCALE * 0.62, 0x000000, alpha * 0.8);
    }

    /** Draws everything queued, farthest first. */
    flush(): void {
        this.parts.sort((a, b) => a.depth - b.depth);
        for (const part of this.parts) part.draw();
        this.parts.length = 0;
    }
}
