// The Farm: a farm under a climate-controlled glass dome. The dome's skin is a honeycomb of hexagon
// panels (a tiling that covers a flat plane with no gaps), laid over the dome the way a map is laid
// over a globe, so the panels shrink toward the rim; here and there one is a dark solar panel.
// Inside, through the glass, are rows of crops, a red barn and a silo.

import { ISO_SQUASH } from '../constants';
import { Canvas3D, lightFactor, ring, seededRandom, shadeColor, type Pt, type V3 } from './canvas';
import { PAD_HEIGHT, SEVEN_HEX_CENTERS, drawHexPad } from './common';

// Sizes (world px / screen px): the dome stands on a steel ring on the pad of 7 hexes; the ring
// (radius 50) fits inside the footprint's hexagon, whose inscribed radius is about 55.
export const FARM_RING_RADIUS = 50;
export const DOME_RADIUS = 47;
export const DOME_HEIGHT = 44;
const RING_HEIGHT = 4;
const FLOOR_Z = PAD_HEIGHT + RING_HEIGHT; // the dome's base and the soil are this high
const PANEL_SIZE = 10.5; // side of a hexagon panel, flat plane px

const STEEL = 0xaeb8bf;
const GLASS = 0xb4e8e2;
const SOLAR = 0x2c4a6e; // dark blue solar panels among the glass
const FRAME = 0xf0faf7;
const SOIL = 0x5e4129;

export interface DomePanel {
    /** Clear glass, or (about one in nine) a dark solar panel. */
    kind: 'glass' | 'solar';
    /** The panel's corners on the dome, relative to the dome's center on its base (z up). */
    corners: V3[];
    /** The outward surface normal at the panel's middle. */
    normal: V3;
}

/**
 * The dome's panels: a honeycomb of hexagons tiling the disc around the top, mapped onto an
 * ellipsoidal dome of `radius` and `height` so distances from the top are kept (an equidistant map:
 * a panel keeps its size going down the slope). The top of the dome is the middle of a hexagon.
 * Each edge is cut in two so the panel follows the curve, and corners beyond the rim are pulled
 * back onto it.
 */
export function domePanels(radius: number, height: number, size = PANEL_SIZE): DomePanel[] {
    const reach = (Math.PI / 2) * radius; // the plane's distance from the top to the rim
    const span = Math.ceil(reach / (size * 1.5)) + 2;
    const panels: DomePanel[] = [];

    const place = (u: number, v: number): V3 => {
        const rho = Math.min(Math.hypot(u, v), reach);
        const theta = (rho / reach) * (Math.PI / 2);
        const phi = Math.atan2(v, u);
        return [
            radius * Math.sin(theta) * Math.cos(phi),
            radius * Math.sin(theta) * Math.sin(phi),
            height * Math.cos(theta),
        ];
    };

    for (let i = -span; i <= span; i++) {
        for (let j = -span; j <= span; j++) {
            // Flat-top hexagons: the centers of a honeycomb of side `size`.
            const cu = 1.5 * size * i;
            const cv = Math.sqrt(3) * size * (j + i / 2);
            const plane: Pt[] = Array.from({ length: 6 }, (_, k) => ({
                x: cu + size * Math.cos((k * Math.PI) / 3),
                y: cv + size * Math.sin((k * Math.PI) / 3),
            }));
            if (plane.every((q) => Math.hypot(q.x, q.y) >= reach)) continue; // wholly past the rim
            if (Math.hypot(cu, cv) > reach) continue;
            // Cut every edge in two so a flat panel can bend with the dome.
            const cut: Pt[] = [];
            plane.forEach((q, k) => {
                const next = plane[(k + 1) % plane.length];
                cut.push(q, { x: (q.x + next.x) / 2, y: (q.y + next.y) / 2 });
            });
            const [mx, my, mz] = place(cu, cv);
            // A scattering of solar panels, the same every time, never at the very top.
            const solar = (i !== 0 || j !== 0) && (i * 73 + j * 151 + 11) % 9 === 0;
            panels.push({
                kind: solar ? 'solar' : 'glass',
                corners: cut.map((q) => place(q.x, q.y)),
                normal: normalize3([mx / radius ** 2, my / radius ** 2, mz / height ** 2]),
            });
        }
    }
    return panels;
}

function normalize3(v: V3): V3 {
    const length = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / length, v[1] / length, v[2] / length];
}

/** True if a panel can be seen from the front (a little slack so panels at the horizon stay). */
function showing(normal: V3): boolean {
    return normal[1] + ISO_SQUASH * normal[2] > -0.12;
}

export function drawFarm(c: Canvas3D, teamColor: number): void {
    const random = seededRandom(0xfa2a);

    drawHexPad(c, SEVEN_HEX_CENTERS, teamColor, 11);
    drawFoundationRing(c);
    drawSoil(c);
    drawCrops(c, random);
    drawBarn(c);
    drawSilo(c);
    drawDome(c);
    drawClimateUnit(c);
}

/** The steel ring the dome stands on. */
function drawFoundationRing(c: Canvas3D): void {
    c.cylinder(
        0,
        0,
        FARM_RING_RADIUS,
        FARM_RING_RADIUS,
        PAD_HEIGHT,
        FLOOR_Z,
        STEEL,
        {
            top: 0x7e8a91,
        },
        32
    );
}

function drawSoil(c: Canvas3D): void {
    c.disc(0, 0, FLOOR_Z, DOME_RADIUS, SOIL);
    // A few lighter furrows toward the front, so the soil isn't one flat color.
    for (let y = -6; y <= 40; y += 8) {
        const half = Math.sqrt(Math.max(0, DOME_RADIUS ** 2 - y * y)) - 4;
        if (half > 4) c.line([-half, y + 3.5, FLOOR_Z], [half, y + 3.5, FLOOR_Z], 1, 0x4a321f, 0.7);
    }
}

/** Rows of crops: leafy greens, tall yellow grain and red-fruited plants, back to front. */
function drawCrops(c: Canvas3D, random: () => number): void {
    const greens = [0x4caf50, 0x5cc060, 0x3f9d46];
    for (let row = 0, y = -8; y <= 40; row++, y += 8) {
        const half = Math.sqrt(Math.max(0, (DOME_RADIUS - 3) ** 2 - y * y));
        if (half < 6) continue;
        const kind = row % 3;
        for (let x = -half; x <= half; x += 6.5) {
            const base = c.p(x + (random() - 0.5) * 1.5, y, FLOOR_Z);
            if (kind === 1) {
                // Grain: a few thin stalks with pale heads.
                for (let k = -1; k <= 1; k++) {
                    c.g.lineStyle(1.2, 0xb7c456, 1);
                    c.g.lineBetween(base.x + k * 1.6, base.y, base.x + k * 1.9, base.y - 7);
                    c.g.fillStyle(0xe6d46a, 1);
                    c.g.fillEllipse(base.x + k * 1.9, base.y - 8, 2, 3.2);
                }
            } else {
                const leaf = greens[Math.floor(random() * greens.length)];
                c.g.fillStyle(shadeColor(leaf, 0.75), 1);
                c.g.fillEllipse(base.x, base.y - 1.5, 6.5, 4.5);
                c.g.fillStyle(leaf, 1);
                c.g.fillEllipse(base.x - 0.5, base.y - 3, 5, 4);
                if (kind === 2 && random() < 0.7) {
                    c.g.fillStyle(0xe5483b, 1);
                    c.g.fillCircle(base.x + 1.2, base.y - 3, 1.3);
                }
            }
        }
    }
}

/** A red barn with white trim: its gable faces the viewer. */
function drawBarn(c: Canvas3D): void {
    const [x0, x1, yFront, yBack] = [-26, -4, -11, -30];
    const xm = (x0 + x1) / 2;
    const wall = FLOOR_Z + 11;
    const ridge = FLOOR_Z + 19;
    const red = 0xb23b30;
    const roof = 0x6a6f76;
    // The two roof slopes (the left one catches the light), then the front wall over them.
    c.poly(
        [
            [x0 - 1.5, yFront + 1.5, wall - 1],
            [xm, yFront + 1.5, ridge + 0.5],
            [xm, yBack, ridge + 0.5],
            [x0 - 1.5, yBack, wall - 1],
        ],
        shadeColor(roof, lightFactor([-7, 0, 9])),
        1,
        { width: 1, color: 0x3e4247 }
    );
    c.poly(
        [
            [xm, yFront + 1.5, ridge + 0.5],
            [x1 + 1.5, yFront + 1.5, wall - 1],
            [x1 + 1.5, yBack, wall - 1],
            [xm, yBack, ridge + 0.5],
        ],
        shadeColor(roof, lightFactor([7, 0, 9])),
        1,
        { width: 1, color: 0x3e4247 }
    );
    c.poly(
        [
            [x0, yFront, FLOOR_Z],
            [x1, yFront, FLOOR_Z],
            [x1, yFront, wall],
            [xm, yFront, ridge],
            [x0, yFront, wall],
        ],
        shadeColor(red, lightFactor([0, 1, 0])),
        1,
        { width: 1, color: 0x6e231c }
    );
    // The big door, with a white frame and cross.
    const [dx0, dx1, dz1] = [xm - 4.5, xm + 4.5, FLOOR_Z + 9];
    c.poly(
        [
            [dx0, yFront, FLOOR_Z],
            [dx1, yFront, FLOOR_Z],
            [dx1, yFront, dz1],
            [dx0, yFront, dz1],
        ],
        0x8f2b22,
        1,
        { width: 1.2, color: 0xf4efe6 }
    );
    c.line([dx0, yFront, FLOOR_Z], [dx1, yFront, dz1], 1, 0xf4efe6);
    c.line([dx1, yFront, FLOOR_Z], [dx0, yFront, dz1], 1, 0xf4efe6);
    // A little hay-loft window in the gable.
    c.poly(
        [
            [xm - 1.5, yFront, wall + 1.5],
            [xm + 1.5, yFront, wall + 1.5],
            [xm + 1.5, yFront, wall + 4.5],
            [xm - 1.5, yFront, wall + 4.5],
        ],
        0xf4efe6
    );
}

function drawSilo(c: Canvas3D): void {
    const [x, y] = [10, -25];
    c.cylinder(x, y, 5.5, 5.5, FLOOR_Z, FLOOR_Z + 14, 0xc4cbd1, { top: null }, 14);
    // Ribs, then a domed cap.
    for (const z of [4.5, 9]) {
        const left = c.p(x - 5.5, y, FLOOR_Z + z);
        const right = c.p(x + 5.5, y, FLOOR_Z + z);
        c.g.lineStyle(0.8, 0x8d969d, 0.8);
        c.g.lineBetween(left.x, left.y + 1.7, right.x, right.y + 1.7);
    }
    c.cylinder(x, y, 5.5, 1.4, FLOOR_Z + 14, FLOOR_Z + 19, 0xd9dfe3, { top: 0xe8edf0 }, 14);
}

/** The glass: hexagon panels (translucent, white-framed), some of them dark solar panels. */
function drawDome(c: Canvas3D): void {
    for (const panel of domePanels(DOME_RADIUS, DOME_HEIGHT)) {
        if (!showing(panel.normal)) continue;
        const factor = lightFactor(panel.normal);
        const points = panel.corners.map((q): V3 => [q[0], q[1], q[2] + FLOOR_Z]);
        if (panel.kind === 'glass') {
            c.poly(points, shadeColor(GLASS, 0.7 + factor * 0.3), 0.2 + 0.22 * factor, {
                width: 1.1,
                color: FRAME,
                alpha: 0.85,
            });
        } else {
            c.poly(points, shadeColor(SOLAR, 0.6 + factor * 0.5), 0.82, {
                width: 1,
                color: 0xdfe9e6,
                alpha: 0.9,
            });
        }
    }
    // A glint on the upper left, and the dome's base line where the glass meets the ring.
    const glint = c.p(-20, 4, FLOOR_Z + 26);
    c.g.fillStyle(0xffffff, 0.35);
    c.g.fillEllipse(glint.x, glint.y, 6, 14);
    const base = ring(0, 0, DOME_RADIUS, 36).map((q) => c.p(q.x, q.y, FLOOR_Z));
    c.g.lineStyle(2.2, 0xe4eef0, 0.95);
    c.g.strokePoints(
        base.filter((q) => q.y >= c.oy - FLOOR_Z - 1),
        false
    );
    // The roof vent on top.
    c.cylinder(0, 0, 3.4, 3.4, FLOOR_Z + DOME_HEIGHT - 1, FLOOR_Z + DOME_HEIGHT + 3, STEEL, {
        top: 0x5c666d,
    });
}

/** The air handler beside the dome, with a duct into the glass: this is what keeps it climate controlled. */
function drawClimateUnit(c: Canvas3D): void {
    const [x0, x1, y0, y1] = [49, 57, -2, 8];
    const top = PAD_HEIGHT + 9;
    c.box(x0, x1, y0, y1, PAD_HEIGHT, top, 0xbac3ca, {
        face: (quad, normal) => {
            if (Math.abs(normal[1]) < 0.9) return;
            // Louvers on the front.
            for (let k = 1; k < 5; k++) {
                const t = k / 5;
                c.g.lineStyle(0.8, 0x6f7a82, 0.9);
                c.g.lineBetween(
                    quad[0].x + 1.2,
                    quad[0].y + (quad[3].y - quad[0].y) * t,
                    quad[1].x - 1.2,
                    quad[1].y + (quad[2].y - quad[1].y) * t
                );
            }
        },
    });
    c.disc((x0 + x1) / 2, (y0 + y1) / 2, top, 3.2, 0x3d464c);
    const fan = c.p((x0 + x1) / 2, (y0 + y1) / 2, top);
    c.g.lineStyle(1, 0xa7b2b9, 1);
    c.g.lineBetween(fan.x - 3, fan.y, fan.x + 3, fan.y);
    c.g.lineBetween(fan.x, fan.y - 1.8, fan.x, fan.y + 1.8);
    c.line([x0 + 1, 3, top - 2], [45.5, 3, PAD_HEIGHT + 22], 2.4, 0x8e999f);
    c.line([x0 + 1, 3, top - 2], [45.5, 3, PAD_HEIGHT + 22], 1, 0xc9d2d8);
    // A green "all well" light.
    const led = c.p(x0 + 2, y1, PAD_HEIGHT + 6.5);
    c.g.fillStyle(0x4cf2a0, 1);
    c.g.fillCircle(led.x, led.y, 0.9);
}
