// A drawing Brush for specs: remembers what it was asked to draw (the structure art's drawing
// calls are plain math over a Brush, so they can run without Phaser).
import type { Brush, Pt } from '../game/structures/canvas';

/** A Brush that remembers what it was asked to draw. */
export function recorder() {
    const calls: string[] = [];
    const points: Pt[] = [];
    const polygons: Pt[][] = [];
    const take = (list: Pt[]) => points.push(...list);
    const brush: Brush = {
        fillStyle: (color, alpha = 1) => calls.push(`fill ${color.toString(16)} ${alpha}`),
        lineStyle: (width, color, alpha = 1) =>
            calls.push(`line ${width} ${color.toString(16)} ${alpha}`),
        fillPoints: (list) => {
            calls.push(`poly ${list.length}`);
            polygons.push(list.map((p) => ({ ...p })));
            take(list);
        },
        strokePoints: (list) => {
            calls.push(`stroke ${list.length}`);
            take(list);
        },
        lineBetween: (x1, y1, x2, y2) => {
            calls.push(
                `between ${x1.toFixed(2)} ${y1.toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)}`
            );
            take([
                { x: x1, y: y1 },
                { x: x2, y: y2 },
            ]);
        },
        fillEllipse: (x, y, w, h) => {
            calls.push(`ellipse ${x.toFixed(2)} ${y.toFixed(2)} ${w} ${h}`);
            take([
                { x: x - w / 2, y: y - h / 2 },
                { x: x + w / 2, y: y + h / 2 },
            ]);
        },
        strokeEllipse: (x, y, w, h) => {
            calls.push(`ellipse-line ${x.toFixed(2)} ${y.toFixed(2)} ${w} ${h}`);
            take([
                { x: x - w / 2, y: y - h / 2 },
                { x: x + w / 2, y: y + h / 2 },
            ]);
        },
        fillCircle: (x, y, r) => {
            calls.push(`circle ${x.toFixed(2)} ${y.toFixed(2)} ${r}`);
            take([
                { x: x - r, y: y - r },
                { x: x + r, y: y + r },
            ]);
        },
        fillRect: (x, y, w, h) => {
            calls.push(`rect ${x.toFixed(2)} ${y.toFixed(2)} ${w} ${h}`);
            take([
                { x, y },
                { x: x + w, y: y + h },
            ]);
        },
    };
    return { brush, calls, points, polygons };
}
