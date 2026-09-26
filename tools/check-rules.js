#!/usr/bin/env node
// Checks the game rules directly against the compiled server modules — no server or client needed.
// Covers: hex math, movement, phases, combat, score, economy, the shop, claim radius, and that the
// hand-copied shared types match on both sides.
//
//   cd server && npm run build && cd .. && node tools/check-rules.js
//
// Backs the claims in docs/ARCHITECTURE.md under Game Mechanics (Map, Movement, Score, Shop, ...).

const fs = require('fs');
const path = require('path');
const { root, dist, section, check, finish } = require('./lib');

const { GameState, Player, Tile, Structure, Projectile } = dist('state/GameState.js');
const { MovementSystem } = dist('systems/MovementSystem.js');
const { CollisionSystem } = dist('systems/CollisionSystem.js');
const { CombatSystem } = dist('systems/CombatSystem.js');
const { PhaseSystem } = dist('systems/PhaseSystem.js');
const { ScoreSystem } = dist('systems/ScoreSystem.js');
const { EconomySystem } = dist('systems/EconomySystem.js');
const { ShopSystem } = dist('systems/ShopSystem.js');
const { hexCenter, pixelToHex, mapPixelSize } = dist('hex.js');
const C = dist('constants.js');
const shared = dist('types/shared.js');

const DT = 1 / C.TICK_RATE;
const SQ = C.SCREEN_Y_SCALE;

function world(phase = 'playing') {
    const state = new GameState();
    state.mapWidth = 64;
    state.mapHeight = 64;
    state.phase.phase = phase;
    for (let i = 0; i < 64 * 64; i++) state.tiles.push(new Tile());
    return state;
}

function addPlayer(state, id, x = 1500, y = 1500) {
    const player = new Player();
    player.id = id;
    player.x = x;
    player.y = y;
    state.players.set(id, player);
    return player;
}

function addStructure(state, ownerId, col, row) {
    const structure = new Structure();
    structure.id = `s-${col}-${row}`;
    structure.ownerId = ownerId;
    structure.tileX = col;
    structure.tileY = row;
    state.structures.set(structure.id, structure);
    return structure;
}

const onScreenSpeed = (player) => Math.hypot(player.vx, player.vy * SQ);

/** Runs `ticks` movement ticks with a constant input and returns the player. */
function drive(dir, ticks, { phase = 'playing', receivedAt = Date.now(), start } = {}) {
    const state = world(phase);
    const player = addPlayer(state, 'a', ...(start ?? [1500, 1500]));
    const inputs = new Map([['a', { dir, seq: 1, receivedAt }]]);
    for (let i = 0; i < ticks; i++) MovementSystem.update(state, inputs, DT);
    return { state, player, inputs };
}

// ---------------------------------------------------------------------------------------------
section('Hex grid');
{
    let mismatches = 0;
    for (let col = 0; col < 64; col++) {
        for (let row = 0; row < 64; row++) {
            const c = hexCenter(col, row);
            for (const [dx, dy] of [
                [0, 0],
                [20, 0],
                [-20, 0],
                [0, 20],
                [0, -20],
                [10, -15],
            ]) {
                const h = pixelToHex(c.x + dx, c.y + dy);
                if (h.col !== col || h.row !== row) mismatches++;
            }
        }
    }
    check(
        'hexCenter -> pixelToHex round-trips for all 4,096 tiles (6 offsets each)',
        mismatches === 0,
        `${mismatches} mismatches`
    );
}

// ---------------------------------------------------------------------------------------------
section('Movement');
{
    const { player } = drive({ x: 1, y: 0 }, 20);
    const ramp = [];
    const state = world();
    const p = addPlayer(state, 'a');
    const inputs = new Map([['a', { dir: { x: 1, y: 0 }, seq: 1, receivedAt: Date.now() }]]);
    for (let i = 0; i < 10; i++) {
        MovementSystem.update(state, inputs, DT);
        ramp.push(onScreenSpeed(p));
    }
    const ticksToTop = ramp.findIndex((v) => v >= C.PLAYER_SPEED - 0.01) + 1;
    check(
        'accelerates to top speed within 5 ticks (eased, not instant)',
        ticksToTop >= 2 && ticksToTop <= 5,
        `${ticksToTop} ticks`
    );
    check('holds top speed', Math.abs(onScreenSpeed(player) - C.PLAYER_SPEED) < 0.5);
}
{
    const r = Math.SQRT1_2;
    for (const [label, sx, sy] of [
        ['right', 1, 0],
        ['up', 0, -1],
        ['down', 0, 1],
        ['up-right', r, -r],
    ]) {
        // What the client sends: the on-screen direction converted to world space (y / SQ).
        const { player } = drive({ x: sx, y: sy / SQ }, 20);
        check(
            `on-screen speed is uniform: ${label}`,
            Math.abs(onScreenSpeed(player) - C.PLAYER_SPEED) < 0.5,
            `${onScreenSpeed(player).toFixed(1)} px/s`
        );
    }
    const { player: half } = drive({ x: 0, y: -0.5 / SQ }, 20);
    check(
        'half-strength stick gives half speed',
        Math.abs(onScreenSpeed(half) - C.PLAYER_SPEED / 2) < 0.5,
        `${onScreenSpeed(half).toFixed(1)} px/s`
    );
    const { player: cheat } = drive({ x: 1, y: 1 / SQ }, 20);
    check(
        'an oversized input vector is clamped to top speed',
        onScreenSpeed(cheat) <= C.PLAYER_SPEED + 0.5,
        `${onScreenSpeed(cheat).toFixed(1)} px/s`
    );
}
{
    const state = world();
    const player = addPlayer(state, 'a');
    const inputs = new Map([['a', { dir: { x: 1, y: 0 }, seq: 1, receivedAt: Date.now() }]]);
    for (let i = 0; i < 10; i++) MovementSystem.update(state, inputs, DT);
    inputs.get('a').receivedAt = Date.now() - (C.INPUT_STALE_MS + 1000); // the client went silent
    for (let i = 0; i < 12; i++) MovementSystem.update(state, inputs, DT);
    check(
        'stale input is dropped: the player coasts to a stop',
        onScreenSpeed(player) === 0,
        `${onScreenSpeed(player).toFixed(1)} px/s`
    );
}
{
    const { player } = drive({ x: 1, y: 0 }, 20, { phase: 'buying' });
    check('nobody moves outside the playing phase', player.x === 1500 && player.vx === 0);
}
{
    const { player: left } = drive({ x: -1, y: 0 }, 400, { start: [100, 1500] });
    const { player: up } = drive({ x: 0, y: -1 / SQ }, 400, { start: [1500, 100] });
    const size = mapPixelSize(64, 64);
    const { player: right } = drive({ x: 1, y: 0 }, 400, { start: [size.width - 100, 1500] });
    const { player: down } = drive({ x: 0, y: 1 / SQ }, 400, { start: [1500, size.height - 100] });
    check(
        'players stop MAP_EDGE_MARGIN inside the left edge',
        left.x === C.MAP_EDGE_MARGIN,
        `x=${left.x}`
    );
    check('...and the top edge', up.y === C.MAP_EDGE_MARGIN, `y=${up.y}`);
    check('...and the right edge', right.x === size.width - C.MAP_EDGE_MARGIN, `x=${right.x}`);
    check('...and the bottom edge', down.y === size.height - C.MAP_EDGE_MARGIN, `y=${down.y}`);
}

// ---------------------------------------------------------------------------------------------
section('Phases');
{
    const state = new GameState();
    const events = [];
    const broadcast = (type, payload) => events.push(payload.phase);
    PhaseSystem.update(state, broadcast);
    check('the lobby never advances on its own', state.phase.phase === 'lobby');
    PhaseSystem.transitionTo(state, 'buying', broadcast);
    check(
        'start -> buying, lasting BUY_PHASE_DURATION_MS',
        state.phase.phase === 'buying' &&
            Math.abs(state.phase.endsAt - Date.now() - C.BUY_PHASE_DURATION_MS) < 100
    );
    state.phase.endsAt = Date.now() - 1;
    PhaseSystem.update(state, broadcast);
    check('buying -> playing when its timer expires', state.phase.phase === 'playing');
    check(
        'playing lasts MATCH_DURATION_MS',
        Math.abs(state.phase.endsAt - Date.now() - C.MATCH_DURATION_MS) < 100
    );
    state.phase.endsAt = Date.now() - 1;
    PhaseSystem.update(state, broadcast);
    check('playing -> results when its timer expires', state.phase.phase === 'results');
    state.phase.endsAt = Date.now() - 1;
    PhaseSystem.update(state, broadcast);
    check('results is terminal (GameRoom closes the room)', state.phase.phase === 'results');
    check(
        'every transition was broadcast',
        events.join('>') === 'buying>playing>results',
        events.join('>')
    );
}

// ---------------------------------------------------------------------------------------------
section('Combat and score');
{
    const state = world();
    const shooter = addPlayer(state, 'a', 100, 100);
    const target = addPlayer(state, 'b', 1500, 1500);
    const shoot = () => {
        const p = new Projectile();
        p.id = `p${Math.random()}`;
        p.ownerId = 'a';
        p.x = target.x - 1;
        p.y = target.y;
        p.angle = 0;
        p.spawnedAt = Date.now();
        state.projectiles.set(p.id, p);
        CombatSystem.update(state, DT, () => {});
    };
    shoot();
    check(
        'one hit does PROJECTILE_DAMAGE',
        target.health === 100 - C.PROJECTILE_DAMAGE,
        `health ${target.health}`
    );
    shoot();
    check(
        'two hits kill: kills +1 and the target respawns at full health',
        shooter.kills === 1 && target.health === 100
    );
}
{
    const state = world();
    const p = addPlayer(state, 'a', 0, 0);
    p.tilesOwned = 10;
    p.kills = 2;
    p.credits = 9999;
    addStructure(state, 'a', 1, 1);
    addStructure(state, 'a', 2, 2);
    addStructure(state, 'other', 3, 3);
    ScoreSystem.update(state);
    const expected = 10 * C.TILE_POINTS + 2 * C.KILL_POINTS + 2 * C.STRUCTURE_POINTS;
    check(
        "score = tiles + kills + own structures; credits and others' structures excluded",
        p.score === expected,
        `${p.score} vs ${expected}`
    );
    state.structures.delete('s-1-1');
    ScoreSystem.update(state);
    check(
        'losing a structure lowers the score (derived, not accumulated)',
        p.score === expected - C.STRUCTURE_POINTS
    );
}
{
    const state = world();
    const p = addPlayer(state, 'a', 0, 0);
    p.tilesOwned = 5;
    const before = p.credits;
    state.nextPayoutAt = Date.now() - 1;
    EconomySystem.update(state);
    check('credits pay out 1 per tile during playing', p.credits === before + 5);
    state.phase.phase = 'lobby';
    state.nextPayoutAt = Date.now() - 1;
    EconomySystem.update(state);
    check('...and never outside it', p.credits === before + 5);
}

// ---------------------------------------------------------------------------------------------
section('Shop');
{
    const ammo = shared.SHOP_ITEMS.ammo;
    const expander = shared.SHOP_ITEMS.expander;
    const p = new Player();
    check(
        'players start with STARTING_CREDITS, base claim radius, and 30 ammo',
        p.credits === C.STARTING_CREDITS && p.claimRadius === C.BASE_CLAIM_RADIUS && p.ammo === 30
    );
    check(
        'an ammo pack costs AMMO_PACK_SIZE x AMMO_CREDITS_PER_SHOT credits',
        ammo.cost === shared.AMMO_PACK_SIZE * shared.AMMO_CREDITS_PER_SHOT,
        `${ammo.cost}`
    );
    const ok = ShopSystem.purchase(p, 'ammo');
    check(
        'buying ammo deducts the cost and adds a pack',
        ok && p.credits === C.STARTING_CREDITS - ammo.cost && p.ammo === 30 + shared.AMMO_PACK_SIZE
    );
    p.credits = ammo.cost - 1;
    check(
        'cannot buy without enough credits',
        ShopSystem.purchase(p, 'ammo') === false && p.credits === ammo.cost - 1
    );
    p.credits = expander.cost;
    check(
        'the Expander sets the claim radius to EXPANDER_CLAIM_RADIUS',
        ShopSystem.purchase(p, 'expander') &&
            p.claimRadius === C.EXPANDER_CLAIM_RADIUS &&
            p.credits === 0
    );
    p.credits = 1000;
    check(
        'only one Expander per player',
        ShopSystem.purchase(p, 'expander') === false && p.credits === 1000
    );
    const junk = ['gun', '', null, undefined, 42, {}, '__proto__', 'toString', 'constructor'];
    check(
        'junk item ids are rejected and cost nothing',
        junk.every((id) => ShopSystem.purchase(p, id) === false) && p.credits === 1000
    );
}

// ---------------------------------------------------------------------------------------------
section('Claiming');
{
    const at = (state, id, col, row, dx = 0, dy = 0) => {
        const c = hexCenter(col, row);
        return addPlayer(state, id, c.x + dx, c.y + dy);
    };
    const claimOnce = (state, player) => {
        const events = [];
        CollisionSystem.claimTiles(state, player, events);
        return events;
    };

    {
        const state = world();
        const p = at(state, 'a', 20, 20);
        check(
            'base radius, standing on a hex center: claims exactly that hex',
            claimOnce(state, p).length === 1
        );
    }
    {
        const state = world();
        const p = at(state, 'a', 20, 20);
        p.claimRadius = C.EXPANDER_CLAIM_RADIUS;
        check(
            'Expander on a hex center: claims itself and all 6 neighbors',
            claimOnce(state, p).length === 7
        );
    }
    {
        // Compare against a brute-force scan of every hex at random positions, both radii.
        const size = mapPixelSize(64, 64);
        let mismatches = 0;
        let trials = 0;
        for (const radius of [C.BASE_CLAIM_RADIUS, C.EXPANDER_CLAIM_RADIUS]) {
            for (let n = 0; n < 400; n++) {
                const state = world();
                const p = addPlayer(
                    state,
                    'a',
                    Math.random() * size.width,
                    Math.random() * size.height
                );
                p.claimRadius = radius;
                const got = new Set(claimOnce(state, p).map((t) => t.y * 64 + t.x));
                const want = new Set();
                const under = pixelToHex(p.x, p.y);
                if (under.col >= 0 && under.row >= 0 && under.col < 64 && under.row < 64)
                    want.add(under.row * 64 + under.col);
                for (let r = 0; r < 64; r++) {
                    for (let c = 0; c < 64; c++) {
                        const ce = hexCenter(c, r);
                        if (Math.hypot(ce.x - p.x, ce.y - p.y) <= radius) want.add(r * 64 + c);
                    }
                }
                trials++;
                if (got.size !== want.size || [...want].some((i) => !got.has(i))) mismatches++;
            }
        }
        check(
            'claimed set matches a brute-force scan (800 random positions, incl. map edges)',
            mismatches === 0,
            `${mismatches}/${trials} mismatches`
        );
    }
    {
        const state = world();
        const victim = addPlayer(state, 'v', 0, 0);
        for (const [c, r] of [
            [21, 20],
            [19, 20],
        ]) {
            state.tiles[r * 64 + c].ownerId = 'v';
            victim.tilesOwned++;
        }
        const p = at(state, 'a', 20, 20);
        p.claimRadius = C.EXPANDER_CLAIM_RADIUS;
        claimOnce(state, p);
        const owned = state.tiles.filter((t) => t.ownerId === 'a').length;
        check(
            'radius claiming steals enemy tiles and keeps both tile counts consistent',
            victim.tilesOwned === 0 && p.tilesOwned === owned && owned === 7
        );
        check('claiming again changes nothing', claimOnce(state, p).length === 0);
    }
    {
        const state = world();
        const p = at(state, 'a', 20, 20);
        p.claimRadius = C.EXPANDER_CLAIM_RADIUS;
        addStructure(state, 'enemy', 21, 20);
        addStructure(state, 'a', 19, 20);
        const claimed = claimOnce(state, p);
        check(
            "another player's structure protects its hex from claiming",
            !claimed.some((t) => t.x === 21 && t.y === 20)
        );
        check(
            "your own structure's hex is still claimable",
            claimed.some((t) => t.x === 19 && t.y === 20)
        );
    }
}

// ---------------------------------------------------------------------------------------------
section('Shared types');
{
    // types/shared.ts is hand-copied to the client; everything after the header comment must match.
    const body = (file) => {
        const text = fs.readFileSync(path.join(root, file), 'utf8');
        return text.slice(text.indexOf('export type GamePhase')).replace(/\r\n/g, '\n');
    };
    check(
        'server and client types/shared.ts are identical (apart from the header comment)',
        body('server/src/types/shared.ts') === body('client/src/types/shared.ts')
    );
}

finish();
