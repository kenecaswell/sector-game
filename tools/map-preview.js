#!/usr/bin/env node
// Renders generated maps to PNG images, whole map top-down, so you can judge terrain generation
// without walking around in the game. No server or browser needed.
//
//   cd server && npm run build && cd .. && node tools/map-preview.js [seed ...] [--out dir]
//
// With no seeds it renders 1-6. Images go to `map-previews/` (or --out) as map-<seed>.png.
// Colors: ground slate; mountains warm white (large) and gray (small), in alternating shades so
// each mountain piece stands out; deep water dark blue, shallow water lighter; spawn red.
// A room's map comes from a random seed; these use fixed seeds, so the same seed always gives
// the same picture (handy for comparing before/after a change to the generator).

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { root, serverDist } = require('./lib');

const { generateTerrain, seededRandom } = require(path.join(serverDist, 'terrain.js'));
const H = require(path.join(serverDist, 'hex.js'));
const { isShallowWater } = require(path.join(serverDist, '..', '..', 'shared', 'terrain.js'));

const args = process.argv.slice(2);
const outFlag = args.indexOf('--out');
const outDir = path.resolve(outFlag >= 0 ? args[outFlag + 1] : path.join(root, 'map-previews'));
const seeds = args.filter((a, i) => a !== '--out' && i !== outFlag + 1).map(Number);
if (seeds.length === 0) seeds.push(1, 2, 3, 4, 5, 6);

const COLS = 64;
const ROWS = 64;
const SCALE = 0.25; // image px per world px (the map is ~3,100 x 3,600 world px)
const COLORS = {
    offMap: [26, 26, 46],
    ground: [58, 71, 99],
    deepWater: [23, 53, 111],
    shallowWater: [52, 96, 170],
    large: [
        [240, 228, 200],
        [225, 212, 180],
    ],
    small: [
        [205, 210, 218],
        [185, 190, 200],
    ],
    spawn: [231, 76, 60],
};

function render(seed) {
    const map = generateTerrain(COLS, ROWS, seededRandom(seed));
    const at = (col, row) => row * COLS + col;
    const isWater = (col, row) =>
        H.isValidHex(col, row, COLS, ROWS) && map.terrain[at(col, row)] === 2;
    const pieceOf = new Map();
    for (const f of map.features) {
        (f.pieces || []).forEach((p, k) =>
            p.hexes.forEach((h) => pieceOf.set(at(h.col, h.row), { size: p.size, k }))
        );
    }

    const { width, height } = H.mapPixelSize(COLS, ROWS);
    const w = Math.ceil(width * SCALE);
    const h = Math.ceil(height * SCALE);
    const raw = Buffer.alloc((w * 3 + 1) * h); // one filter byte per row, then RGB
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const hex = H.pixelToHex(x / SCALE, y / SCALE);
            let color = COLORS.offMap;
            if (H.isValidHex(hex.col, hex.row, COLS, ROWS)) {
                const i = at(hex.col, hex.row);
                const t = map.terrain[i];
                if (t === 0) color = COLORS.ground;
                else if (t === 2)
                    color = isShallowWater(isWater, hex.col, hex.row)
                        ? COLORS.shallowWater
                        : COLORS.deepWater;
                else {
                    const piece = pieceOf.get(i);
                    color = COLORS[piece ? piece.size : 'small'][piece ? piece.k % 2 : 0];
                }
                if (hex.col === map.spawn.col && hex.row === map.spawn.row) color = COLORS.spawn;
            }
            raw.set(color, y * (w * 3 + 1) + 1 + x * 3);
        }
    }
    const counts = ['mountain', 'lake', 'river'].map(
        (k) => `${map.features.filter((f) => f.kind === k).length} ${k}s`
    );
    const terrain = map.terrain.filter((t) => t !== 0).length;
    return {
        png: encodePng(w, h, raw),
        summary: `${((terrain / (COLS * ROWS)) * 100).toFixed(1)}% terrain, ${counts.join(', ')}`,
    };
}

// Minimal PNG encoder (8-bit RGB), so this needs no image library.
function encodePng(w, h, raw) {
    const table = Array.from({ length: 256 }, (_, n) => {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        return c >>> 0;
    });
    const crc = (buf) => {
        let c = 0xffffffff;
        for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
        return (c ^ 0xffffffff) >>> 0;
    };
    const chunk = (type, data) => {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(data.length);
        const body = Buffer.concat([Buffer.from(type), data]);
        const sum = Buffer.alloc(4);
        sum.writeUInt32BE(crc(body));
        return Buffer.concat([len, body, sum]);
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(w, 0);
    header.writeUInt32BE(h, 4);
    header[8] = 8; // bit depth
    header[9] = 2; // RGB
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk('IHDR', header),
        chunk('IDAT', zlib.deflateSync(raw)),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

fs.mkdirSync(outDir, { recursive: true });
for (const seed of seeds) {
    const { png, summary } = render(seed);
    const file = path.join(outDir, `map-${seed}.png`);
    fs.writeFileSync(file, png);
    console.log(`seed ${seed}: ${path.relative(process.cwd(), file)} (${summary})`);
}
