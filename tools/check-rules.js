#!/usr/bin/env node
// Checks the game rules directly against the compiled server modules — no server or client needed.
// Covers: hex math, movement, phases and the lobby, characters, teams, combat, score, economy, the
// shop, claim radius, and structures. (Code shared with the client lives in shared/, one copy, so
// there's nothing to compare between the two sides any more.)
//
//   cd server && npm run build && cd .. && node tools/check-rules.js
//
// Backs the claims in docs/ARCHITECTURE.md under Game Mechanics (Map, Movement, Score, Shop, ...).

const { dist, section, check, finish } = require('./lib');

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
const { hexCenter, pixelToHex, mapPixelSize, hexNeighbors, structureFootprint } = dist('hex.js');
const H = dist('hex.js');
const { StructureSystem } = dist('systems/StructureSystem.js');
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
section('Player names');
{
    const n = shared.normalizePlayerName;
    check(
        'names are trimmed and whitespace collapsed; any characters allowed',
        n('  Ada   Lovelace ') === 'Ada Lovelace' &&
            n('a\tb') === 'a b' &&
            n('José 🚀') === 'José 🚀' &&
            n('x\u0000y') === 'xy'
    );
    check(
        `length must be ${shared.PLAYER_NAME_MIN_LENGTH}-${shared.PLAYER_NAME_MAX_LENGTH} characters (emoji count as one)`,
        n('a') === null &&
            n('   a  ') === null &&
            n('ab') === 'ab' &&
            n('x'.repeat(25)) !== null &&
            n('x'.repeat(26)) === null &&
            n('🚀'.repeat(25)) !== null
    );
    check(
        'non-strings are refused',
        [undefined, null, 42, {}, ['ab']].every((v) => n(v) === null)
    );

    const state = new GameState();
    const a = addPlayer(state, 'a');
    a.name = 'Bob';
    const b = addPlayer(state, 'b');
    b.name = 'Bob (1)';
    check(
        'a taken name gets the first free " (N)" suffix, ignoring case',
        LobbySystem.uniqueName(state, 'Bob') === 'Bob (2)' &&
            LobbySystem.uniqueName(state, 'bob') === 'bob (2)' &&
            LobbySystem.uniqueName(state, 'Alice') === 'Alice'
    );
    check(
        'keeping your own name is not a clash',
        LobbySystem.setName(state, a, 'Bob') && a.name === 'Bob'
    );
    a.name = 'x'.repeat(25);
    const long = LobbySystem.uniqueName(state, 'x'.repeat(25));
    check('the suffix still fits in the max length', long === 'x'.repeat(21) + ' (1)', long);
    check(
        'a newcomer without a valid saved name is "Player N"',
        LobbySystem.joiningName(state, undefined) === 'Player 3' &&
            LobbySystem.joiningName(state, 'a') === 'Player 3' &&
            LobbySystem.joiningName(state, ' Cy ') === 'Cy'
    );
    check(
        'renaming works while ready, but not with an invalid name',
        LobbySystem.setReady(state, b, true) &&
            LobbySystem.setName(state, b, 'Carol') &&
            b.name === 'Carol' &&
            !LobbySystem.setName(state, b, 'C') &&
            b.name === 'Carol'
    );
    state.phase.phase = 'playing';
    check(
        'renaming is refused once the match is on',
        !LobbySystem.setName(state, b, 'Dave') && b.name === 'Carol'
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
    check('an enemy still takes damage', enemy.health === 100 - shared.GUN_DAMAGE.basic);

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
        'one basic-gun hit does GUN_DAMAGE.basic',
        target.health === 100 - shared.GUN_DAMAGE.basic,
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
    const I = shared.SHOP_ITEMS;
    const buyer = (credits = 10000) => {
        const p = new Player();
        p.credits = credits;
        return p;
    };
    const p = new Player();
    check(
        'before their kit is applied, players have no credits, ammo or gun, 100 health, base radius',
        p.credits === 0 &&
            p.ammo === 0 &&
            p.gun === '' &&
            p.health === 100 &&
            p.maxHealth === 100 &&
            p.claimRadius === C.BASE_CLAIM_RADIUS
    );
    check(
        'prices: guns 100/200, upgrades and structures 100, ammo 1 per shot',
        I.basicGun.cost === 100 &&
            I.bigGun.cost === 200 &&
            ['boost', 'armor', 'expander', 'farm', 'mine', 'fort', 'power'].every(
                (id) => I[id].cost === 100
            ) &&
            I.ammo.cost === shared.AMMO_PACK_SIZE * shared.AMMO_CREDITS_PER_SHOT
    );
    {
        const b = buyer(I.ammo.cost - 1);
        check(
            'cannot buy without enough credits',
            ShopSystem.purchase(b, 'ammo') === false && b.credits === I.ammo.cost - 1
        );
        b.credits = 1000;
        check(
            'ammo adds a pack (even without a gun) and can be bought again',
            ShopSystem.purchase(b, 'ammo') &&
                ShopSystem.purchase(b, 'ammo') &&
                b.ammo === 2 * shared.AMMO_PACK_SIZE &&
                b.credits === 1000 - 2 * I.ammo.cost
        );
    }
    {
        const b = buyer(1000);
        check('the basic gun arms you', ShopSystem.purchase(b, 'basicGun') && b.gun === 'basic');
        check('...only once', !ShopSystem.purchase(b, 'basicGun') && b.credits === 900);
        check(
            'the big gun replaces it',
            ShopSystem.purchase(b, 'bigGun') && b.gun === 'big' && b.credits === 700
        );
        check(
            "...and you can't go back to the basic gun or buy the big one twice",
            !ShopSystem.purchase(b, 'basicGun') &&
                !ShopSystem.purchase(b, 'bigGun') &&
                b.credits === 700
        );
        const c = buyer(1000);
        check(
            'the big gun can be bought without the basic one first',
            ShopSystem.purchase(c, 'bigGun') && c.gun === 'big'
        );
    }
    {
        const b = buyer(1000);
        b.health = 40; // hurt
        check(
            'armor doubles max health and adds the extra 100 right away',
            ShopSystem.purchase(b, 'armor') && b.maxHealth === 200 && b.health === 140
        );
        check(
            'boost is an upgrade you keep',
            ShopSystem.purchase(b, 'boost') && b.upgrades.includes('boost')
        );
        check(
            'the Expander sets the claim radius to EXPANDER_CLAIM_RADIUS',
            ShopSystem.purchase(b, 'expander') && b.claimRadius === C.EXPANDER_CLAIM_RADIUS
        );
        const credits = b.credits;
        check(
            'every upgrade is one per player',
            ['armor', 'boost', 'expander'].every((id) => !ShopSystem.purchase(b, id)) &&
                b.credits === credits
        );
        const robot = buyer(1000);
        robot.character = 'robot';
        CharacterSystem.apply(robot);
        robot.credits = 1000;
        check("a Robot can't buy the boost it starts with", !ShopSystem.purchase(robot, 'boost'));
    }
    {
        const b = buyer(1000);
        const ok = ['farm', 'farm', 'mine', 'fort', 'power'].every((id) =>
            ShopSystem.purchase(b, id)
        );
        check(
            'structures add to the inventory, as many as you can pay for',
            ok && b.structureInventory.join() === 'farm,farm,mine,fort,power' && b.credits === 500
        );
    }
    {
        const b = buyer(1000);
        const junk = ['gun', '', null, undefined, 42, {}, '__proto__', 'toString', 'constructor'];
        check(
            'junk item ids are rejected and cost nothing',
            junk.every((id) => ShopSystem.purchase(b, id) === false) && b.credits === 1000
        );
    }
    {
        const state = world();
        const shooter = addPlayer(state, 'a', 100, 100);
        const target = addPlayer(state, 't', 1500, 1500);
        const shot = new Projectile();
        shot.id = 'big';
        shot.ownerId = 'a';
        shot.x = target.x - 1;
        shot.y = target.y;
        shot.damage = shared.GUN_DAMAGE.big;
        shot.spawnedAt = Date.now();
        state.projectiles.set(shot.id, shot);
        CombatSystem.update(state, DT, () => {});
        check(
            'a big-gun hit (100) kills an unarmored player outright; they respawn at full health',
            shooter.kills === 1 && target.health === 100
        );
        target.upgrades.push('armor');
        CharacterSystem.applyUpgradeEffects(target);
        target.health = target.maxHealth;
        const again = new Projectile();
        again.id = 'big2';
        again.ownerId = 'a';
        again.x = target.x - 1;
        again.y = target.y;
        again.damage = shared.GUN_DAMAGE.big;
        again.spawnedAt = Date.now();
        state.projectiles.set(again.id, again);
        CombatSystem.update(state, DT, () => {});
        check(
            '...but an armored one survives it with 100 left',
            target.health === 100 && shooter.kills === 1
        );
    }
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
section('Structures (7-hex footprint)');
{
    const R = C.HEX_SIZE;
    let badNeighbors = 0;
    for (const [col, row] of [
        [10, 10],
        [11, 10],
        [0, 0],
        [63, 63],
    ]) {
        const c = hexCenter(col, row);
        const ns = hexNeighbors(col, row);
        const unique = new Set(ns.map((n) => `${n.col},${n.row}`)).size === 6;
        const adjacent = ns.every((n) => {
            const d = hexCenter(n.col, n.row);
            return Math.abs(Math.hypot(d.x - c.x, d.y - c.y) - Math.sqrt(3) * R) < 1e-6;
        });
        if (!unique || !adjacent) badNeighbors++;
    }
    check('hexNeighbors gives the 6 adjacent hexes (even and odd columns)', badNeighbors === 0);

    const corners = H.STRUCTURE_CORNER_OFFSETS;
    let area = 0;
    for (let i = 0; i < 6; i++) {
        const a = corners[i];
        const b = corners[(i + 1) % 6];
        area += a.x * b.y - b.x * a.y;
    }
    area = Math.abs(area) / 2;
    const hexArea = ((3 * Math.sqrt(3)) / 2) * R * R;
    check(
        'the structure hexagon is flat-topped with twice a hex radius (the area of 4 hexes)',
        Math.abs(area - 4 * hexArea) < 1e-6 &&
            Math.abs(corners[0].x - 2 * R) < 1e-9 &&
            Math.abs(corners[0].y) < 1e-9,
        `${(area / hexArea).toFixed(4)} hexes`
    );
    // Each corner is a vertex of the grid: a corner of some hex in the footprint.
    const center = hexCenter(20, 20);
    const gridVertex = (p) =>
        structureFootprint(20, 20).some((h) => {
            const hc = hexCenter(h.col, h.row);
            return [0, 1, 2, 3, 4, 5].some((k) => {
                const a = (k * Math.PI) / 3;
                return (
                    Math.hypot(hc.x + R * Math.cos(a) - p.x, hc.y + R * Math.sin(a) - p.y) < 1e-6
                );
            });
        });
    check(
        "its corners are grid vertices (corners of the footprint's outer hexes)",
        corners.every((c) => gridVertex({ x: center.x + c.x, y: center.y + c.y }))
    );

    // Two structures whose footprints don't share a hex never overlap (separating-axis test).
    const poly = (col, row) => {
        const c = hexCenter(col, row);
        return corners.map((o) => ({ x: c.x + o.x, y: c.y + o.y }));
    };
    const overlapDepth = (p, q) => {
        let min = Infinity;
        for (const shape of [p, q]) {
            for (let i = 0; i < 6; i++) {
                const a = shape[i];
                const b = shape[(i + 1) % 6];
                const nx = b.y - a.y;
                const ny = a.x - b.x;
                const len = Math.hypot(nx, ny);
                const proj = (pts) => pts.map((v) => (v.x * nx + v.y * ny) / len);
                const pp = proj(p);
                const qq = proj(q);
                const depth = Math.min(
                    Math.max(...pp) - Math.min(...qq),
                    Math.max(...qq) - Math.min(...pp)
                );
                min = Math.min(min, depth);
            }
        }
        return min; // <= 0: separated or touching
    };
    // The hexagon stays inside its own footprint (sampled on a fine grid, a hair inside the edge),
    // so structures with separate footprints can never overlap.
    let outside = 0;
    for (let u = -1; u <= 1; u += 0.02) {
        for (let v = -1; v <= 1; v += 0.02) {
            const p = {
                x: center.x + u * 2 * R * 0.999,
                y: center.y + v * Math.sqrt(3) * R * 0.999,
            };
            const inHexagon = corners.every((a, i) => {
                const b = corners[(i + 1) % 6];
                return (
                    (b.x - a.x) * (p.y - center.y - a.y) - (b.y - a.y) * (p.x - center.x - a.x) >= 0
                );
            });
            if (!inHexagon) continue;
            const h = pixelToHex(p.x, p.y);
            if (!structureFootprint(20, 20).some((f) => f.col === h.col && f.row === h.row))
                outside++;
        }
    }
    check(
        'the hexagon lies entirely inside its 7-hex footprint',
        outside === 0,
        `${outside} points outside`
    );
    let pairs = 0;
    let worst = -Infinity;
    for (const [col, row] of [
        [20, 20],
        [21, 20],
    ]) {
        const base = new Set(structureFootprint(col, row).map((h) => `${h.col},${h.row}`));
        for (let c = col - 5; c <= col + 5; c++) {
            for (let r = row - 5; r <= row + 5; r++) {
                if (structureFootprint(c, r).some((h) => base.has(`${h.col},${h.row}`))) continue;
                pairs++;
                worst = Math.max(worst, overlapDepth(poly(col, row), poly(c, r)));
            }
        }
    }
    check(
        `structures with separate footprints never overlap (${pairs} placements)`,
        worst < 1e-6,
        `deepest overlap ${worst.toFixed(3)}px`
    );
}
{
    const own = (state, id, col, row) => {
        for (const h of structureFootprint(col, row)) state.tiles[h.row * 64 + h.col].ownerId = id;
    };
    const state = world();
    own(state, 'a', 20, 20);
    check(
        'you can build when all 7 footprint hexes are yours',
        StructureSystem.canPlace(state, 'a', 20, 20)
    );
    check('...but not someone else', !StructureSystem.canPlace(state, 'b', 20, 20));
    state.tiles[hexNeighbors(20, 20)[3].row * 64 + hexNeighbors(20, 20)[3].col].ownerId = 'b';
    check('one footprint hex not yours: refused', !StructureSystem.canPlace(state, 'a', 20, 20));
    const edge = world();
    own(edge, 'a', 0, 10);
    for (let r = 0; r < 64; r++) edge.tiles[r * 64].ownerId = 'a';
    check(
        'the map edge (a footprint hex off the map) is refused',
        !StructureSystem.canPlace(edge, 'a', 0, 10) &&
            !StructureSystem.canPlace(edge, 'a', 5, 0) &&
            !StructureSystem.canPlace(edge, 'a', 63, 30)
    );
    const packed = world();
    own(packed, 'a', 20, 20);
    own(packed, 'a', 22, 20);
    addStructure(packed, 'a', 20, 20);
    check(
        "footprints can't overlap another structure's",
        !StructureSystem.canPlace(packed, 'a', 22, 20) &&
            !StructureSystem.canPlace(packed, 'a', 20, 20)
    );
    own(packed, 'a', 23, 21);
    const apart = !structureFootprint(23, 21).some((h) =>
        structureFootprint(20, 20).some((g) => g.col === h.col && g.row === h.row)
    );
    check(
        '...but can sit right next to it',
        apart && StructureSystem.canPlace(packed, 'a', 23, 21)
    );
}
{
    const state = world();
    const foe = addPlayer(state, 'f');
    for (const h of structureFootprint(30, 30)) state.tiles[h.row * 64 + h.col].ownerId = 'o';
    addPlayer(state, 'o', 0, 0);
    addStructure(state, 'o', 30, 30);
    let claimedAny = false;
    for (const h of structureFootprint(30, 30)) {
        const c = hexCenter(h.col, h.row);
        foe.x = c.x;
        foe.y = c.y;
        foe.claimRadius = C.EXPANDER_CLAIM_RADIUS;
        const events = [];
        CollisionSystem.claimTiles(state, foe, events);
        if (
            events.some((t) =>
                structureFootprint(30, 30).some((g) => g.col === t.x && g.row === t.y)
            )
        )
            claimedAny = true;
    }
    check('all 7 footprint hexes are protected from enemy claiming', !claimedAny);

    const s = [...state.structures.values()][0];
    const c = hexCenter(30, 30);
    const inner = H.STRUCTURE_CORNER_OFFSETS.map((o) => ({
        x: c.x + o.x * 0.95,
        y: c.y + o.y * 0.95,
    }));
    const outer = H.STRUCTURE_CORNER_OFFSETS.map((o) => ({
        x: c.x + o.x * 1.05,
        y: c.y + o.y * 1.05,
    }));
    check(
        'shots hit anywhere inside the hexagon and nowhere outside it',
        inner.every((p) => CollisionSystem.checkProjectileStructureCollision(p, s)) &&
            outer.every((p) => !CollisionSystem.checkProjectileStructureCollision(p, s))
    );
}

finish();
