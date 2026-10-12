#!/usr/bin/env node
// Draws the characters' sprite sheets to PNG, with no browser and no Phaser: it bundles the art in
// client/src/game/characters/ with the client's own bundler (rolldown) and paints it with a small
// anti-aliasing software rasterizer that stands in for Phaser's Graphics (both are a `Brush`).
//
//   node tools/character-sheet.js [--out dir] [--scale n]
//   node tools/character-sheet.js --closeup SE,NW [--equip booster:3] [--armor 2] --scale 6
//
// Writes to `character-sheets/` (or --out), at --scale times the game's px (default 2):
//   characters.png          8 facings (N NE E SE S SW W NW) x 5 characters (Farmer, Scientist,
//                           Explorer, Engineer, Robot); transparent, one 64x80 frame per cell
//   characters-preview.png  the same on a light grid, for looking at
//   upgrades.png            each character in the SE and NW views with each upgrade on: nothing,
//                           Booster 1 and 3, Harvester 1 and 3, Armor 1 and 3, Jetpack
//   upgrades-preview.png    the same on a light grid
// --closeup instead draws only the named facings of the base sheet (optionally with an upgrade on,
// for checking details at a large --scale) to closeup-preview.png.

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const { root } = require('./lib');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
    const at = args.indexOf(name);
    return at >= 0 ? args[at + 1] : fallback;
};
const outDir = path.resolve(flag('--out', path.join(root, 'character-sheets')));
const SCALE = Number(flag('--scale', 2));
const SS = 4; // supersampling per axis

// --- The art, bundled -------------------------------------------------------------------------

function loadArt() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'character-art-'));
    const bundle = path.join(dir, 'art.cjs');
    const rolldown = path.join(root, 'client', 'node_modules', '.bin', 'rolldown');
    execFileSync(
        rolldown,
        [
            path.join(root, 'client', 'src', 'game', 'characters', 'index.ts'),
            '--format',
            'cjs',
            '--file',
            bundle,
            '--silent',
        ],
        { stdio: 'inherit' }
    );
    return require(bundle);
}

// --- A Brush that paints pixels ---------------------------------------------------------------

class Raster {
    constructor(width, height) {
        this.w = Math.round(width * SCALE) * SS;
        this.h = Math.round(height * SCALE) * SS;
        this.px = new Float32Array(this.w * this.h * 4); // premultiplied RGBA
        this.fill = [0, 0, 0, 1];
        this.line = [1, 0, 0, 0, 1]; // width, r, g, b, a
        this.k = SCALE * SS;
    }

    static rgb(color) {
        return [((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255];
    }

    fillStyle(color, alpha = 1) {
        this.fill = [...Raster.rgb(color), alpha];
    }
    lineStyle(width, color, alpha = 1) {
        this.line = [width, ...Raster.rgb(color), alpha];
    }

    // Even-odd scanline fill of `points` (in brush px) at pixel centers of the supersampled grid.
    paint(points, [r, g, b, a]) {
        const k = this.k;
        const pts = points.map((p) => [p.x * k, p.y * k]);
        let minY = Infinity;
        let maxY = -Infinity;
        for (const [, y] of pts) {
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        }
        const y0 = Math.max(0, Math.ceil(minY - 0.5));
        const y1 = Math.min(this.h - 1, Math.floor(maxY - 0.5));
        const n = pts.length;
        for (let y = y0; y <= y1; y++) {
            const cy = y + 0.5;
            const xs = [];
            for (let i = 0; i < n; i++) {
                const [ax, ay] = pts[i];
                const [bx, by] = pts[(i + 1) % n];
                if ((ay <= cy && by > cy) || (by <= cy && ay > cy)) {
                    xs.push(ax + ((cy - ay) / (by - ay)) * (bx - ax));
                }
            }
            xs.sort((p, q) => p - q);
            for (let j = 0; j + 1 < xs.length; j += 2) {
                const x0 = Math.max(0, Math.ceil(xs[j] - 0.5));
                const x1 = Math.min(this.w - 1, Math.ceil(xs[j + 1] - 0.5) - 1);
                for (let x = x0; x <= x1; x++) {
                    const i = (y * this.w + x) * 4;
                    const keep = 1 - a;
                    this.px[i] = r * a + this.px[i] * keep;
                    this.px[i + 1] = g * a + this.px[i + 1] * keep;
                    this.px[i + 2] = b * a + this.px[i + 2] * keep;
                    this.px[i + 3] = a + this.px[i + 3] * keep;
                }
            }
        }
    }

    fillPoints(points) {
        this.paint(points, this.fill);
    }

    ellipsePoints(x, y, w, h, count = 28) {
        return Array.from({ length: count }, (_, i) => {
            const t = (i * 2 * Math.PI) / count;
            return { x: x + (w / 2) * Math.cos(t), y: y + (h / 2) * Math.sin(t) };
        });
    }

    fillEllipse(x, y, w, h) {
        this.paint(this.ellipsePoints(x, y, w, h), this.fill);
    }
    fillCircle(x, y, r) {
        this.paint(this.ellipsePoints(x, y, r * 2, r * 2, 16), this.fill);
    }
    fillRect(x, y, w, h) {
        this.paint(
            [
                { x, y },
                { x: x + w, y },
                { x: x + w, y: y + h },
                { x, y: y + h },
            ],
            this.fill
        );
    }
    strokeEllipse(x, y, w, h) {
        this.strokePoints(this.ellipsePoints(x, y, w, h), true);
    }

    // A segment as a quad of the line's width, with round ends.
    segment(a, b, style) {
        const [width, r, g, bl, alpha] = style;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        const half = width / 2;
        if (len > 1e-6) {
            const nx = (-dy / len) * half;
            const ny = (dx / len) * half;
            this.paint(
                [
                    { x: a.x + nx, y: a.y + ny },
                    { x: b.x + nx, y: b.y + ny },
                    { x: b.x - nx, y: b.y - ny },
                    { x: a.x - nx, y: a.y - ny },
                ],
                [r, g, bl, alpha]
            );
        }
    }
    strokePoints(points, close) {
        const n = points.length;
        for (let i = 0; i < (close ? n : n - 1); i++) {
            this.segment(points[i], points[(i + 1) % n], this.line);
        }
        // Round the joints, so a thick outline has no notches at its corners.
        const [width, r, g, b, a] = this.line;
        if (width > 1.2) {
            for (const p of points) {
                this.paint(this.ellipsePoints(p.x, p.y, width, width, 8), [r, g, b, a]);
            }
        }
    }
    lineBetween(x1, y1, x2, y2) {
        this.segment({ x: x1, y: y1 }, { x: x2, y: y2 }, this.line);
    }

    /** The finished image: the supersampled pixels averaged down, as straight RGBA bytes. */
    toRGBA() {
        const w = this.w / SS;
        const h = this.h / SS;
        const out = Buffer.alloc(w * h * 4);
        const area = SS * SS;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                let r = 0;
                let g = 0;
                let b = 0;
                let a = 0;
                for (let sy = 0; sy < SS; sy++) {
                    for (let sx = 0; sx < SS; sx++) {
                        const i = ((y * SS + sy) * this.w + x * SS + sx) * 4;
                        r += this.px[i];
                        g += this.px[i + 1];
                        b += this.px[i + 2];
                        a += this.px[i + 3];
                    }
                }
                a /= area;
                const o = (y * w + x) * 4;
                if (a > 0) {
                    out[o] = Math.round(Math.min(1, r / area / a) * 255);
                    out[o + 1] = Math.round(Math.min(1, g / area / a) * 255);
                    out[o + 2] = Math.round(Math.min(1, b / area / a) * 255);
                }
                out[o + 3] = Math.round(a * 255);
            }
        }
        return { width: w, height: h, data: out };
    }
}

// --- PNG ---------------------------------------------------------------------------------------

function png({ width, height, data }) {
    const chunk = (type, body) => {
        const length = Buffer.alloc(4);
        length.writeUInt32BE(body.length);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type), body])) >>> 0);
        return Buffer.concat([length, Buffer.from(type), body, crc]);
    };
    const head = Buffer.alloc(13);
    head.writeUInt32BE(width, 0);
    head.writeUInt32BE(height, 4);
    head[8] = 8; // bit depth
    head[9] = 6; // RGBA
    const rows = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) {
        data.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
    }
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk('IHDR', head),
        chunk('IDAT', zlib.deflateSync(rows, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

/** Lays `image` over a light background with a faint grid, `cellW` x `cellH` px cells. */
function onBackground(image, cellW, cellH) {
    const { width, height, data } = image;
    const out = Buffer.alloc(data.length);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const o = (y * width + x) * 4;
            const edge = x % cellW === 0 || y % cellH === 0;
            const checker = (((x / cellW) | 0) + ((y / cellH) | 0)) % 2 === 0;
            const bg = edge ? [201, 190, 172] : checker ? [237, 230, 216] : [231, 223, 207];
            const a = data[o + 3] / 255;
            for (let c = 0; c < 3; c++) out[o + c] = Math.round(data[o + c] * a + bg[c] * (1 - a));
            out[o + 3] = 255;
        }
    }
    return { width, height, data: out };
}

// --- The sheets --------------------------------------------------------------------------------

function sheet(art, rows, columns, draw) {
    const { width: fw, height: fh, originX, originY } = art.CHARACTER_FRAME;
    const raster = new Raster(fw * columns, fh * rows);
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < columns; col++) {
            draw(raster, col * fw + originX, row * fh + originY, row, col);
        }
    }
    return raster.toRGBA();
}

function main() {
    const art = loadArt();
    const ids = ['farmer', 'scientist', 'explorer', 'engineer', 'robot'];
    const { width: fw, height: fh } = art.CHARACTER_FRAME;
    fs.mkdirSync(outDir, { recursive: true });
    const write = (name, image, cell) => {
        fs.writeFileSync(path.join(outDir, `${name}.png`), png(image));
        fs.writeFileSync(
            path.join(outDir, `${name}-preview.png`),
            png(onBackground(image, cell[0] * SCALE, cell[1] * SCALE))
        );
        console.log(`${name}.png  ${image.width}x${image.height}`);
    };

    const closeup = flag('--closeup', '');
    if (closeup) {
        const names = closeup.split(',');
        const [equipped, level] = flag('--equip', ':').split(':');
        const loadout = { equipped, level: Number(level) || 1, armor: Number(flag('--armor', 0)) };
        const image = sheet(art, ids.length, names.length, (g, x, y, row, col) => {
            const dir = art.DIRECTIONS.find((d) => d.name === names[col]);
            art.drawCharacter(g, x, y, ids[row], dir.angle, loadout);
        });
        fs.writeFileSync(
            path.join(outDir, 'closeup-preview.png'),
            png(onBackground(image, fw * SCALE, fh * SCALE))
        );
        return;
    }

    const characters = sheet(art, ids.length, 8, (g, x, y, row, col) => {
        art.drawCharacter(g, x, y, ids[row], art.DIRECTIONS[col].angle);
    });
    write('characters', characters, [fw, fh]);

    const loadouts = [
        {},
        { equipped: 'booster', level: 1 },
        { equipped: 'booster', level: 3 },
        { equipped: 'expander', level: 1 },
        { equipped: 'expander', level: 3 },
        { armor: 1 },
        { armor: 3 },
        { equipped: 'wings' },
    ];
    // Facing SE shows the front; NW shows the back, where the packs are.
    const views = [3, 7];
    const upgrades = sheet(art, ids.length * views.length, loadouts.length, (g, x, y, row, col) => {
        const id = ids[Math.floor(row / views.length)];
        const angle = art.DIRECTIONS[views[row % views.length]].angle;
        art.drawCharacter(g, x, y, id, angle, loadouts[col]);
    });
    write('upgrades', upgrades, [fw, fh]);
}

main();
