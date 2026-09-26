#!/usr/bin/env node
// Checks the game rules directly against the compiled server modules — no server or client needed.
// Covers: hex math, movement, phases and the lobby, characters, teams, combat, score, economy, the
// shop, claim radius, and that the hand-copied shared types match on both sides.
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
const { LobbySystem } = dist('systems/LobbySystem.js');
const { CharacterSystem } = dist('systems/CharacterSystem.js');
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

function addPlayer(state, id, x = 1500, y = 1500, teamId = '') {
    const player = new Player();
    player.id = id;
    player.teamId = teamId;
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
    const { player } = drive({ x: 1, y: 0 }, 20, { phase: 'countdown' });
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
section('Phases and the lobby');
{
    const state = new GameState();
    const events = [];
    const broadcast = (type, payload) => events.push(payload.phase);
    PhaseSystem.update(state, broadcast);
    LobbySystem.update(state, broadcast);
    check(
        'an empty lobby never advances on its own',
        state.phase.phase === 'lobby' && events.length === 0
    );

    const a = addPlayer(state, 'a');
    const b = addPlayer(state, 'b');
    LobbySystem.setReady(state, a, true);
    LobbySystem.update(state, broadcast);
    check('one player ready of two: still the lobby', state.phase.phase === 'lobby');
    b.connected = false;
    LobbySystem.update(state, broadcast);
    check(
        'a disconnected player does not hold up the countdown',
        state.phase.phase === 'countdown'
    );
    b.connected = true;
    LobbySystem.update(state, broadcast);
    check('...but a connected, unready one cancels it', state.phase.phase === 'lobby');
    LobbySystem.setReady(state, b, true);
    LobbySystem.update(state, broadcast);
    check(
        'everyone ready -> countdown, lasting COUNTDOWN_DURATION_MS',
        state.phase.phase === 'countdown' &&
            Math.abs(state.phase.endsAt - Date.now() - C.COUNTDOWN_DURATION_MS) < 100
    );
    LobbySystem.setReady(state, b, false);
    LobbySystem.update(state, broadcast);
    check('un-readying during the countdown cancels it', state.phase.phase === 'lobby');

    check(
        'team and character can be changed while not ready',
        LobbySystem.selectTeam(state, a, 'blue') === false && // a is ready: locked
            LobbySystem.selectTeam(state, b, 'blue') &&
            LobbySystem.selectCharacter(state, b, 'smuggler') &&
            b.teamId === 'blue' &&
            b.color === shared.TEAMS.blue.color &&
            b.character === 'smuggler'
    );
    check(
        'junk team, character and ready values are refused',
        !LobbySystem.selectTeam(state, b, 'pink') &&
            !LobbySystem.selectTeam(state, b, '__proto__') &&
            !LobbySystem.selectCharacter(state, b, 'wizard') &&
            !LobbySystem.setReady(state, b, 'yes') &&
            b.teamId === 'blue' &&
            b.character === 'smuggler' &&
            b.ready === false
    );

    LobbySystem.setReady(state, b, true);
    LobbySystem.update(state, broadcast);
    state.phase.endsAt = Date.now() - 1;
    LobbySystem.update(state, broadcast);
    check(
        'the countdown ends -> playing, lasting MATCH_DURATION_MS',
        state.phase.phase === 'playing' &&
            Math.abs(state.phase.endsAt - Date.now() - C.MATCH_DURATION_MS) < 100
    );
    check(
        'everyone got their starting kit when the match began',
        a.character === 'farmer' &&
            a.structureInventory.join() === 'farm' &&
            b.gun === 'basic' &&
            b.ammo === 15
    );
    check(
        'lobby choices are refused once the match is on',
        !LobbySystem.selectTeam(state, b, 'red') &&
            !LobbySystem.selectCharacter(state, b, 'robot') &&
            !LobbySystem.setReady(state, b, false)
    );
    state.phase.endsAt = Date.now() - 1;
    PhaseSystem.update(state, broadcast);
    check('playing -> results when its timer expires', state.phase.phase === 'results');
    state.phase.endsAt = Date.now() - 1;
    PhaseSystem.update(state, broadcast);
    LobbySystem.update(state, broadcast);
    check('results is terminal (GameRoom closes the room)', state.phase.phase === 'results');
    check(
        'every transition was broadcast',
        events.join('>') === 'countdown>lobby>countdown>lobby>countdown>playing>results',
        events.join('>')
    );
}
{
    const state = new GameState();
    const teams = [];
    for (let i = 0; i < 10; i++) {
        const p = addPlayer(state, `p${i}`, 0, 0, LobbySystem.defaultTeam(state));
        teams.push(p.teamId);
    }
    check(
        'newcomers get an empty team first, then the smallest',
        teams.slice(0, 8).join() === shared.TEAM_IDS.join() &&
            teams[8] === shared.TEAM_IDS[0] &&
            teams[9] === shared.TEAM_IDS[1],
        teams.join()
    );
}

// ---------------------------------------------------------------------------------------------
section('Characters');
{
    const kits = shared.CHARACTER_IDS.map((id) => {
        const p = new Player();
        p.character = id;
        p.credits = 999;
        p.ammo = 999;
        p.structureInventory.push('fort', 'fort');
        CharacterSystem.apply(p);
        const c = shared.CHARACTERS[id];
        return (
            p.gun === (c.gun ?? '') &&
            p.ammo === c.ammo &&
            p.credits === c.credits &&
            p.structureInventory.join() === c.structures.join() &&
            p.upgrades.join() === c.upgrades.join()
        );
    });
    check(
        "applying a character replaces the kit with exactly that character's",
        kits.every(Boolean),
        shared.CHARACTER_IDS.filter((_, i) => !kits[i]).join()
    );
    const p = new Player();
    check('a new player defaults to the Farmer', p.character === shared.DEFAULT_CHARACTER);
    p.character = 'nonsense';
    CharacterSystem.apply(p);
    check(
        'an unknown character falls back to the default kit',
        p.structureInventory.join() ===
            shared.CHARACTERS[shared.DEFAULT_CHARACTER].structures.join()
    );
}
{
    const state = world();
    const robot = addPlayer(state, 'r');
    robot.upgrades.push('boost');
    const inputs = new Map([['r', { dir: { x: 1, y: 0 }, seq: 1, receivedAt: Date.now() }]]);
    for (let i = 0; i < 20; i++) MovementSystem.update(state, inputs, DT);
    const want = C.PLAYER_SPEED * C.BOOST_SPEED_MULTIPLIER;
    check(
        'the boost upgrade raises top speed by BOOST_SPEED_MULTIPLIER',
        Math.abs(onScreenSpeed(robot) - want) < 0.5,
        `${onScreenSpeed(robot).toFixed(1)} px/s`
    );
}

// ---------------------------------------------------------------------------------------------
section('Teams');
{
    const state = world();
    const shooter = addPlayer(state, 'a', 100, 100, 'red');
    const mate = addPlayer(state, 'm', 1500, 1500, 'red');
    const enemy = addPlayer(state, 'e', 1500, 1700, 'blue');
    const fire = (target) => {
        const p = new Projectile();
        p.id = `p${Math.random()}`;
        p.ownerId = 'a';
        p.x = target.x - 1;
        p.y = target.y;
        p.angle = 0;
        p.spawnedAt = Date.now();
        state.projectiles.set(p.id, p);
        CombatSystem.update(state, DT, () => {});
        return state.projectiles.has(p.id);
    };
    const passedThrough = fire(mate);
    check(
        'no friendly fire: a shot passes through a teammate',
        mate.health === 100 && passedThrough
    );
    fire(enemy);
    check('an enemy still takes damage', enemy.health === 100 - C.PROJECTILE_DAMAGE);

    const mateFort = addStructure(state, 'm', 40, 40);
    const c = hexCenter(40, 40);
    const shot = new Projectile();
    shot.id = 'ps';
    shot.ownerId = 'a';
    shot.x = c.x;
    shot.y = c.y;
    shot.spawnedAt = Date.now();
    state.projectiles.set(shot.id, shot);
    CombatSystem.update(state, DT, () => {});
    check("...nor to a teammate's structure", mateFort.health === mateFort.maxHealth);
}
{
    // Walk into a teammate's structure and an enemy's one.
    const walk = (ownerTeam) => {
        const state = world();
        const target = hexCenter(30, 30);
        const p = addPlayer(state, 'a', target.x - 150, target.y, 'red');
        addPlayer(state, 'o', 0, 0, ownerTeam);
        addStructure(state, 'o', 30, 30);
        const inputs = new Map([['a', { dir: { x: 1, y: 0 }, seq: 1, receivedAt: Date.now() }]]);
        for (let i = 0; i < 20; i++) MovementSystem.update(state, inputs, DT);
        return p.x - target.x;
    };
    check("you can walk through a teammate's structure", walk('red') > 0, walk('red').toFixed(1));
    check("...but not an enemy's", walk('blue') < -C.PLAYER_RADIUS + 1, walk('blue').toFixed(1));
    check(
        "players with no team don't count as teammates",
        walk('') < -C.PLAYER_RADIUS + 1 && addPlayer(world(), 'x').teamId === ''
    );
}
{
    const state = world();
    const mate = addPlayer(state, 'm', 0, 0, 'red');
    const foe = addPlayer(state, 'f', 0, 0, 'blue');
    state.tiles[20 * 64 + 21].ownerId = 'm';
    mate.tilesOwned = 1;
    state.tiles[20 * 64 + 19].ownerId = 'f';
    foe.tilesOwned = 1;
    const c = hexCenter(20, 20);
    const p = addPlayer(state, 'a', c.x, c.y, 'red');
    p.claimRadius = C.EXPANDER_CLAIM_RADIUS;
    CollisionSystem.claimTiles(state, p, []);
    check(
        "radius claiming leaves teammates' tiles alone but takes enemies'",
        state.tiles[20 * 64 + 21].ownerId === 'm' &&
            mate.tilesOwned === 1 &&
            state.tiles[20 * 64 + 19].ownerId === 'a' &&
            foe.tilesOwned === 0 &&
            p.tilesOwned === 6
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
    const gun = shared.SHOP_ITEMS.basicGun;
    const p = new Player();
    check(
        'before their kit is applied, players have no credits, ammo or gun and the base radius',
        p.credits === 0 && p.ammo === 0 && p.gun === '' && p.claimRadius === C.BASE_CLAIM_RADIUS
    );
    p.credits = 100;
    check(
        'an ammo pack costs AMMO_PACK_SIZE x AMMO_CREDITS_PER_SHOT credits',
        ammo.cost === shared.AMMO_PACK_SIZE * shared.AMMO_CREDITS_PER_SHOT,
        `${ammo.cost}`
    );
    const ok = ShopSystem.purchase(p, 'ammo');
    check(
        'buying ammo deducts the cost and adds a pack',
        ok && p.credits === 100 - ammo.cost && p.ammo === shared.AMMO_PACK_SIZE
    );
    p.credits = gun.cost;
    check(
        'the Basic gun arms the player',
        ShopSystem.purchase(p, 'basicGun') && p.gun === 'basic' && p.credits === 0
    );
    p.credits = 1000;
    check(
        'only one gun per player',
        ShopSystem.purchase(p, 'basicGun') === false && p.credits === 1000
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
