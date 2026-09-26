// Random terrain for a match: mostly ground, with mountain ranges, lakes and rivers.
// The rules (sizes, separation, the clear spawn area, nothing walled off) are in
// docs/GAME_DESIGN.md → Terrain; the numbers are in constants.ts.

import {
    FEATURE_GAP,
    LAKE_SIZE,
    MOUNTAIN_LARGE_CHANCE,
    MOUNTAIN_SIZE,
    RIVER_LENGTH,
    RIVER_TURN_CHANCE,
    RIVER_POCKET_FILL,
    RIVER_WIDTH,
    RIVER_WIDTH_CHANGE_CHANCE,
    SPAWN_CLEAR_RADIUS,
    TERRAIN_COVERAGE,
    TERRAIN_FEATURE_WEIGHTS,
} from './constants';
import {
    hexDistance,
    hexIndex,
    hexNeighbors,
    isValidHex,
    mapPixelSize,
    pixelToHex,
    type HexCoord,
} from './hex';
import { TERRAIN, type Terrain } from './types/shared';
import { blocksWalking, isShallowWater } from '../../shared/terrain';
import type { GameState } from './state/GameState';

export type FeatureKind = 'mountain' | 'lake' | 'river';

/** One mountain within a range: small (3 hexes that all touch) or large (a hex and its 6 neighbors). */
export interface MountainPiece {
    size: 'small' | 'large';
    hexes: HexCoord[];
}

export interface TerrainFeature {
    kind: FeatureKind;
    hexes: HexCoord[];
    /** Mountain ranges only: the small and large mountains it's made of (they partition `hexes`). */
    pieces?: MountainPiece[];
    /** Rivers only: hexes along its course (the rest widen it, up to RIVER_WIDTH.max across). */
    length?: number;
    /** Rivers only: hexes added afterwards to fill holes left where it bends (see RIVER_POCKET_FILL). */
    filled?: number;
}

export interface GeneratedTerrain {
    terrain: Terrain[]; // index = row * cols + col
    features: TerrainFeature[];
    spawn: HexCoord; // the hex players spawn on (kept clear)
}

/** A small, fast seeded random number generator (mulberry32): the same seed gives the same map. */
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

/** The hex at the center of the map, where GameRoom spawns (and respawns) players. */
export function spawnHex(cols: number, rows: number): HexCoord {
    const { width, height } = mapPixelSize(cols, rows);
    return pixelToHex(width / 2, height / 2);
}

interface GridTables {
    neighbors: Int32Array; // hex i's six neighbor indices at [i * 6 + k], -1 = off the map
    nearSpawn: Uint8Array; // 1 = within SPAWN_CLEAR_RADIUS of the spawn hex
    nearby: Int32Array[]; // every hex within FEATURE_GAP steps of hex i (which another feature must stay out of)
}
const gridTablesCache = new Map<string, GridTables>();

/**
 * Lookup tables the generator's checks use millions of times per map. They depend only on the map
 * size (not on the random layout), so they're built once per size and reused by every room.
 */
function gridTables(cols: number, rows: number, spawn: HexCoord): GridTables {
    const key = `${cols}x${rows}`;
    const cached = gridTablesCache.get(key);
    if (cached) return cached;
    const size = cols * rows;
    const valid = (h: HexCoord) => isValidHex(h.col, h.row, cols, rows);
    const at = (h: HexCoord) => hexIndex(h.col, h.row, cols);
    const neighbors = new Int32Array(size * 6).fill(-1);
    const nearSpawn = new Uint8Array(size);
    const nearby: Int32Array[] = new Array(size);
    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const i = hexIndex(col, row, cols);
            hexNeighbors(col, row).forEach((n, k) => {
                if (valid(n)) neighbors[i * 6 + k] = at(n);
            });
            if (hexDistance({ col, row }, spawn) <= SPAWN_CLEAR_RADIUS) nearSpawn[i] = 1;
            const close: number[] = [];
            for (let r = row - FEATURE_GAP - 1; r <= row + FEATURE_GAP + 1; r++) {
                for (let c = col - FEATURE_GAP; c <= col + FEATURE_GAP; c++) {
                    const h = { col: c, row: r };
                    if (
                        (c !== col || r !== row) &&
                        valid(h) &&
                        hexDistance(h, { col, row }) <= FEATURE_GAP
                    ) {
                        close.push(at(h));
                    }
                }
            }
            nearby[i] = Int32Array.from(close);
        }
    }
    const tables = { neighbors, nearSpawn, nearby };
    gridTablesCache.set(key, tables);
    return tables;
}

/**
 * Generates a layout. Features are added one at a time, alternating kinds by weight, until about
 * TERRAIN_COVERAGE of the map is terrain. Each feature grows only onto hexes that are free, outside
 * the spawn area, and not next to another feature. A feature that would wall off any ground from
 * the spawn is undone, so every generated map is valid without restarting.
 */
export function generateTerrain(
    cols: number,
    rows: number,
    random: () => number = Math.random
): GeneratedTerrain {
    const size = cols * rows;
    const featureOf = new Int32Array(size).fill(-1); // which feature owns each hex
    const features: TerrainFeature[] = [];
    const spawn = spawnHex(cols, rows);
    const target = Math.round(size * TERRAIN_COVERAGE);

    const randInt = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
    const at = (h: HexCoord) => hexIndex(h.col, h.row, cols);
    const valid = (h: HexCoord) => isValidHex(h.col, h.row, cols, rows);

    const { neighbors, nearSpawn, nearby } = gridTables(cols, rows, spawn);

    /** Can feature `id` grow onto this hex? (Free, outside the spawn area, and no other feature within FEATURE_GAP.) */
    const open = (h: HexCoord, id: number): boolean => {
        if (!valid(h)) return false;
        const i = at(h);
        if (featureOf[i] !== -1 || nearSpawn[i]) return false;
        const close = nearby[i];
        for (let k = 0; k < close.length; k++) {
            const other = featureOf[close[k]];
            if (other !== -1 && other !== id) return false;
        }
        return true;
    };

    const randomOpenHex = (id: number): HexCoord | null => {
        for (let tries = 0; tries < 50; tries++) {
            const h = { col: randInt(0, cols - 1), row: randInt(0, rows - 1) };
            if (open(h, id)) return h;
        }
        return null;
    };

    /**
     * A mountain range of up to `count` hexes, built from pieces: the first anywhere open, each
     * next one touching the range (sharing no hex with it). A piece is large when the dice say so
     * and it still fits under `count`, else small; the range stops when neither fits anywhere.
     */
    const growRange = (
        id: number,
        count: number
    ): { hexes: HexCoord[]; pieces: MountainPiece[] } => {
        const hexes: HexCoord[] = [];
        const pieces: MountainPiece[] = [];
        // All three hexes of a small piece touch each other: a hex and two neighbors 60° apart.
        const small = (h: HexCoord, k: number): HexCoord[] => {
            const around = hexNeighbors(h.col, h.row);
            return [h, around[k], around[(k + 1) % 6]];
        };
        const large = (center: HexCoord): HexCoord[] => [
            center,
            ...hexNeighbors(center.col, center.row),
        ];
        const fits = (piece: HexCoord[]) => piece.every((h) => open(h, id));
        const touchesRange = (piece: HexCoord[]) =>
            hexes.length === 0 ||
            piece.some((h) =>
                hexNeighbors(h.col, h.row).some((n) => valid(n) && featureOf[at(n)] === id)
            );

        /** How many sides the piece shares with the range so far (more = a chunkier range). */
        const contacts = (piece: HexCoord[]) =>
            piece.reduce(
                (sum, h) =>
                    sum +
                    hexNeighbors(h.col, h.row).filter((n) => valid(n) && featureOf[at(n)] === id)
                        .length,
                0
            );

        /**
         * Where the next piece of this size goes: anywhere open for the first one; after that, of
         * every placement touching the range (each hex beside it, each orientation), the one that
         * shares the most sides with it (ties broken at random). Filling the range's notches first
         * grows it into a compact clump instead of lacy branches.
         */
        const findPiece = (size: 'small' | 'large'): HexCoord[] | null => {
            if (hexes.length === 0) {
                for (let tries = 0; tries < 40; tries++) {
                    const anchor = randomOpenHex(id);
                    if (!anchor) return null;
                    const piece = size === 'small' ? small(anchor, randInt(0, 5)) : large(anchor);
                    if (piece.every(valid) && fits(piece)) return piece;
                }
                return null;
            }
            // Hexes beside the range; a large piece's center may be one step further out.
            const beside = new Map<number, HexCoord>();
            for (const h of hexes) {
                for (const n of hexNeighbors(h.col, h.row)) {
                    if (valid(n) && featureOf[at(n)] !== id) beside.set(at(n), n);
                }
            }
            const anchors = new Map(beside);
            if (size === 'large') {
                for (const b of beside.values()) {
                    for (const n of hexNeighbors(b.col, b.row)) {
                        if (valid(n) && featureOf[at(n)] !== id) anchors.set(at(n), n);
                    }
                }
            }
            let best: HexCoord[] | null = null;
            let bestScore = -1;
            let ties = 0;
            for (const anchor of anchors.values()) {
                const options =
                    size === 'small'
                        ? [0, 1, 2, 3, 4, 5].map((k) => small(anchor, k))
                        : [large(anchor)];
                for (const piece of options) {
                    if (!piece.every(valid) || !fits(piece) || !touchesRange(piece)) continue;
                    const score = contacts(piece);
                    if (score > bestScore) {
                        best = piece;
                        bestScore = score;
                        ties = 1;
                    } else if (score === bestScore && random() < 1 / ++ties) {
                        best = piece; // keep a random one of the equally good placements
                    }
                }
            }
            return best;
        };

        while (hexes.length < count) {
            const room = count - hexes.length;
            const order: Array<'small' | 'large'> =
                room >= 7 && random() < MOUNTAIN_LARGE_CHANCE ? ['large', 'small'] : ['small'];
            let piece: HexCoord[] | null = null;
            let size: 'small' | 'large' = 'small';
            for (const s of order) {
                if (s === 'small' && room < 3) break;
                piece = findPiece(s);
                if (piece) {
                    size = s;
                    break;
                }
            }
            if (!piece) break; // nothing fits: the range is done
            for (const h of piece) featureOf[at(h)] = id;
            hexes.push(...piece);
            pieces.push({ size, hexes: piece });
        }
        return { hexes, pieces };
    };

    /**
     * A lake of up to `count` hexes, grown from a random start one hex at a time. Each step takes the
     * open hex beside it that touches the lake on the most sides (ties at random), so lakes grow
     * round and solid instead of in lacy arms, and fill any notch before spreading.
     */
    const growLake = (id: number, count: number): HexCoord[] => {
        const start = randomOpenHex(id);
        if (!start) return [];
        const hexes = [start];
        featureOf[at(start)] = id;
        while (hexes.length < count) {
            const seen = new Set<number>();
            let best: HexCoord | null = null;
            let bestScore = -1;
            let ties = 0;
            for (const h of hexes) {
                for (const n of hexNeighbors(h.col, h.row)) {
                    if (!open(n, id) || seen.has(at(n))) continue;
                    seen.add(at(n));
                    const score = hexNeighbors(n.col, n.row).filter(
                        (m) => valid(m) && featureOf[at(m)] === id
                    ).length;
                    if (score > bestScore) {
                        best = n;
                        bestScore = score;
                        ties = 1;
                    } else if (score === bestScore && random() < 1 / ++ties) {
                        best = n;
                    }
                }
            }
            if (!best) break; // boxed in: keep what we have
            featureOf[at(best)] = id;
            hexes.push(best);
        }
        return hexes;
    };

    /**
     * A river: a course of up to RIVER_LENGTH.max hexes that bends now and then. Each hex of the
     * course is widened by a short row of hexes to one side (60° off the flow), so the river is
     * RIVER_WIDTH.min-max hexes across; the width drifts up or down by one as it goes.
     */
    const growRiver = (id: number): { hexes: HexCoord[]; length: number; filled: number } => {
        const start = randomOpenHex(id);
        if (!start) return { hexes: [], length: 0, filled: 0 };
        const wanted = randInt(RIVER_LENGTH.min, RIVER_LENGTH.max);
        const side = random() < 0.5 ? 1 : 5; // the widening row runs 60° to the right or left
        let dir = randInt(0, 5); // hexNeighbors index: the same 6 directions for every hex
        let width = randInt(RIVER_WIDTH.min, RIVER_WIDTH.max);
        const hexes: HexCoord[] = [];
        const take = (h: HexCoord) => {
            featureOf[at(h)] = id;
            hexes.push(h);
        };
        const widen = (center: HexCoord) => {
            let beside = center;
            for (let across = 1; across < width; across++) {
                beside = hexNeighbors(beside.col, beside.row)[(dir + side) % 6];
                if (!open(beside, id)) break; // narrower here rather than touching something
                take(beside);
            }
        };

        let center = start;
        take(center);
        widen(center);
        let length = 1;
        while (length < wanted) {
            if (random() < RIVER_TURN_CHANCE) dir = (dir + (random() < 0.5 ? 1 : 5)) % 6;
            // Straight on if possible, else bend either way; never double back.
            const options = [dir, (dir + 1) % 6, (dir + 5) % 6];
            const next = options
                .map((d) => ({ d, h: hexNeighbors(center.col, center.row)[d] }))
                .find(({ h }) => open(h, id));
            if (!next) break;
            dir = next.d;
            center = next.h;
            take(center);
            length++;
            if (random() < RIVER_WIDTH_CHANGE_CHANCE) {
                width += random() < 0.5 ? -1 : 1;
                width = Math.max(RIVER_WIDTH.min, Math.min(RIVER_WIDTH.max, width));
            }
            widen(center);
        }

        // Where a wide river bends, the widening rows on either side of the bend don't meet, leaving
        // ground pockets inside it. Fill any free hex that's mostly surrounded by this river (again,
        // since a fill can leave a new pocket beside it).
        let filled = 0;
        for (let pass = 0; pass < 50; pass++) {
            const pockets: HexCoord[] = [];
            const seen = new Set<number>();
            for (const h of hexes) {
                for (const n of hexNeighbors(h.col, h.row)) {
                    if (!open(n, id) || seen.has(at(n))) continue;
                    seen.add(at(n));
                    const around = hexNeighbors(n.col, n.row).filter(
                        (m) => valid(m) && featureOf[at(m)] === id
                    ).length;
                    if (around >= RIVER_POCKET_FILL) pockets.push(n);
                }
            }
            if (pockets.length === 0) break;
            pockets.forEach(take);
            filled += pockets.length;
        }
        return { hexes, length, filled };
    };

    const kindFor = (roll: number): FeatureKind => {
        const { mountain, lake } = TERRAIN_FEATURE_WEIGHTS;
        const total = mountain + lake + TERRAIN_FEATURE_WEIGHTS.river;
        if (roll * total < mountain) return 'mountain';
        return roll * total < mountain + lake ? 'lake' : 'river';
    };

    /** Walkable without Wings: ground, or shallow water (1-wide river stretches; isShallowWater). */
    const isWaterAt = (col: number, row: number): boolean => {
        if (!isValidHex(col, row, cols, rows)) return false;
        const id = featureOf[hexIndex(col, row, cols)];
        return id !== -1 && features[id]?.kind !== 'mountain';
    };
    // Whether each water hex is shallow. It depends only on its own feature (features never come
    // within FEATURE_GAP of each other) and features don't change once placed, so it's worked out
    // once per feature instead of on every flood fill.
    const shallow = new Uint8Array(size);
    const markShallow = (feature: TerrainFeature) => {
        if (feature.kind === 'mountain') return;
        for (const h of feature.hexes) {
            shallow[at(h)] = isShallowWater(isWaterAt, h.col, h.row) ? 1 : 0;
        }
    };
    const passable = (index: number): boolean => featureOf[index] === -1 || shallow[index] === 1;

    /** Can every ground hex still be reached on foot from the spawn? (A flood fill.) */
    const reached = new Uint8Array(size);
    const queue = new Int32Array(size);
    const allGroundReachable = (): boolean => {
        reached.fill(0);
        let head = 0;
        let tail = 0;
        queue[tail++] = at(spawn);
        reached[at(spawn)] = 1;
        while (head < tail) {
            const i = queue[head++];
            for (let k = 0; k < 6; k++) {
                const n = neighbors[i * 6 + k];
                if (n === -1 || reached[n] || !passable(n)) continue;
                reached[n] = 1;
                queue[tail++] = n;
            }
        }
        for (let i = 0; i < size; i++) if (featureOf[i] === -1 && !reached[i]) return false;
        return true;
    };

    let covered = 0;
    for (let attempt = 0; covered < target && attempt < 1000; attempt++) {
        const id = features.length;
        const kind = kindFor(random());
        let feature: TerrainFeature;
        if (kind === 'river') {
            const river = growRiver(id);
            feature = { kind, hexes: river.hexes, length: river.length, filled: river.filled };
        } else if (kind === 'mountain') {
            const range = growRange(id, randInt(MOUNTAIN_SIZE.min, MOUNTAIN_SIZE.max));
            feature = { kind, hexes: range.hexes, pieces: range.pieces };
        } else {
            feature = { kind, hexes: growLake(id, randInt(LAKE_SIZE.min, LAKE_SIZE.max)) };
        }

        const tooShort =
            kind === 'river'
                ? (feature.length ?? 0) < RIVER_LENGTH.min
                : feature.hexes.length < (kind === 'mountain' ? MOUNTAIN_SIZE : LAKE_SIZE).min;
        features.push(feature); // pushed before the reachability check, which reads its kind
        // Skip a feature that would overshoot the coverage target by more than 1% of the map; a
        // smaller one will come along.
        const overshoots = covered + feature.hexes.length > target + size * 0.01;
        markShallow(feature);
        if (feature.hexes.length === 0 || tooShort || overshoots || !allGroundReachable()) {
            for (const h of feature.hexes) {
                featureOf[at(h)] = -1; // undo
                shallow[at(h)] = 0;
            }
            features.pop();
            continue;
        }
        covered += feature.hexes.length;
    }

    const terrain: Terrain[] = new Array(size).fill(TERRAIN.ground);
    for (const feature of features) {
        const type = feature.kind === 'mountain' ? TERRAIN.mountain : TERRAIN.water;
        for (const h of feature.hexes) terrain[at(h)] = type;
    }
    return { terrain, features, spawn };
}

// --- Terrain in a running match --------------------------------------------------------------

/** The terrain at hex (col, row) of a match, or undefined off the map. */
export function terrainAt(state: GameState, col: number, row: number): Terrain | undefined {
    if (!isValidHex(col, row, state.mapWidth, state.mapHeight)) return undefined;
    return state.tiles[hexIndex(col, row, state.mapWidth)]?.terrain;
}

/** Whether a player on foot (no Wings) is stopped by hex (col, row): a mountain or deep water. */
export function blocksWalkingAt(state: GameState, col: number, row: number): boolean {
    return blocksWalking((c, r) => terrainAt(state, c, r), col, row);
}

/** Whether the world point (x, y) is over a mountain (which stops shots). */
export function isMountainAtPoint(state: GameState, x: number, y: number): boolean {
    const { col, row } = pixelToHex(x, y);
    return terrainAt(state, col, row) === TERRAIN.mountain;
}
