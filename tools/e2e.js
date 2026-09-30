#!/usr/bin/env node
// End-to-end checks: starts its own throwaway server (private port, phase times scaled down with
// PHASE_TIME_SCALE) and drives real colyseus.js clients through it. It never touches your dev
// server. Takes about a minute.
//
//   cd server && npm run build && cd .. && node tools/e2e.js
//
// Backs the claims in docs/ARCHITECTURE.md under Game Mechanics (Game Phases, Lobby, Shop), Room
// Lifecycle (closing a finished room), and Reconnection System (notifications).

const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const { root, serverDist, dist, colyseusClient, section, check, finish, sleep } = require('./lib');

const { Client } = colyseusClient();
const { pixelToHex, hexCenter, hexNeighbors, mapPixelSize, structureFootprint } = dist('hex.js');
const C = dist('constants.js');
const shared = dist('types/shared.js');

// Its own throwaway server. E2E_PORT lets several runs happen at once (e.g. to hunt a flaky check).
const PORT = Number(process.env.E2E_PORT) || 2598;
const URL = `ws://localhost:${PORT}`;

// ---------------------------------------------------------------------------------------------
// Harness

function healthy() {
    return new Promise((resolve) => {
        http.get({ host: 'localhost', port: PORT, path: '/health', timeout: 500 }, (res) => {
            res.resume();
            resolve(res.statusCode === 200);
        })
            .on('error', () => resolve(false))
            .on('timeout', function () {
                this.destroy();
                resolve(false);
            });
    });
}

/** Runs `fn` against a fresh server whose phases are `scale` times their normal length. */
/** Runs `fn` against a fresh server; `env` adds variables, e.g. { TERRAIN_COVERAGE: '0' } for no terrain. */
async function withServer(scale, fn, env = {}) {
    if (await healthy()) throw new Error(`port ${PORT} is already in use`);
    const child = spawn(process.execPath, [path.join(serverDist, 'index.js')], {
        env: { ...process.env, PORT: String(PORT), PHASE_TIME_SCALE: String(scale), ...env },
        stdio: 'ignore',
    });
    try {
        for (let i = 0; i < 60 && !(await healthy()); i++) await sleep(100);
        if (!(await healthy()))
            throw new Error(
                'the test server did not start (did you run `npm run build` in server/?)'
            );
        await fn();
    } finally {
        child.kill();
        // Wait for the port to actually free up so the next scenario can reuse it.
        for (let i = 0; i < 50 && (await healthy()); i++) await sleep(100);
    }
}

async function join(client, options) {
    const room = await client.joinOrCreate('GameRoom', options);
    if (!room.state?.phase) await new Promise((resolve) => room.onStateChange.once(resolve));
    room.inbox = [];
    room.gameOver = null;
    room.phases = [];
    room.onMessage('gameOver', (m) => (room.gameOver = m));
    room.onMessage('phaseChanged', (m) => room.phases.push(m.phase));
    room.onMessage('playerDisconnected', (m) => room.inbox.push({ type: 'disconnected', ...m }));
    room.onMessage('playerReconnected', (m) => room.inbox.push({ type: 'reconnected', ...m }));
    room.onMessage('*', () => {});
    return room;
}

const me = (room) => room.state.players.get(room.sessionId);
const phaseOf = (room) => room.state.phase.phase;

async function waitFor(condition, ms = 30000) {
    const start = Date.now();
    while (Date.now() - start < ms) {
        if (condition()) return true;
        await sleep(50);
    }
    return condition();
}

/** Can a newcomer get into this room? OPEN / LOCKED (exists, closed to joins) / GONE. */
async function probe(roomId) {
    try {
        const room = await new Client(URL).joinById(roomId);
        room.leave(true);
        return 'OPEN';
    } catch (e) {
        return /locked/i.test(e.message)
            ? 'LOCKED'
            : /not found|invalid/i.test(e.message)
              ? 'GONE'
              : `error: ${e.message}`;
    }
}

let seq = 0;
const move = (room, x, y) => room.send('input', { dir: { x, y }, angle: 0, seq: ++seq });
async function hold(room, x, y, ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        move(room, x, y);
        await sleep(100);
    }
    move(room, 0, 0);
}
/** Everyone marks themselves ready; resolves once the countdown has finished and play began. */
async function startMatch(...rooms) {
    rooms.forEach((room) => room.send('setReady', { ready: true }));
    await waitFor(() => phaseOf(rooms[0]) === 'playing', 5000);
}
/** Walks the player to within a few px of a world point (stopping there). */
async function goTo(room, target, ms = 4000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        const dx = target.x - me(room).x;
        const dy = target.y - me(room).y;
        const distance = Math.hypot(dx, dy);
        if (distance < 8) break;
        const scale = Math.min(1, distance / 60); // ease off so we stop on the spot
        move(room, (dx / distance) * scale, (dy / distance) * scale);
        await sleep(50);
    }
    move(room, 0, 0);
    await sleep(250);
}
const hexUnder = (room) => pixelToHex(me(room).x, me(room).y);
// A player's materials minus what they earned claiming (MATERIALS_PER_CLAIM a hex; the spawn hex is
// claimed at once), i.e. what's left of their character's starting materials if they bought nothing.
const kitMaterials = (p) => p.materials - p.tilesOwned * C.MATERIALS_PER_CLAIM;
const drop = (room) => room.connection.transport.ws.close(4001); // an unclean close, like a network drop

// ---------------------------------------------------------------------------------------------
async function lobby() {
    section('The lobby (real phase times)');
    await withServer(1, async () => {
        const client = new Client(URL);
        // Teams on, so picking a teammate's color can be checked below.
        const a = await join(client, { game: { teams: true } });
        const b = await join(client);
        const terrainShare =
            Array.from(a.state.tiles).filter((t) => t.terrain !== shared.TERRAIN.ground).length /
            a.state.tiles.length;
        check(
            'each room has a generated map: about TERRAIN_COVERAGE of the hexes are terrain',
            Math.abs(terrainShare - C.TERRAIN_COVERAGE) < 0.01,
            `${(terrainShare * 100).toFixed(1)}%`
        );
        check(
            '...and a newcomer sees the same map as everyone else',
            Array.from(b.state.tiles).every((t, i) => t.terrain === a.state.tiles[i].terrain)
        );
        const pickups = Array.from(a.state.pickups.values());
        const locations = C.PICKUP_GRID.cols * C.PICKUP_GRID.rows;
        check(
            'pickups lie on ground hexes (up to one per grid cell), the same for everyone',
            pickups.length > 0 &&
                pickups.length <= locations &&
                pickups.every(
                    (p) => a.state.tiles[p.tileY * 64 + p.tileX].terrain === shared.TERRAIN.ground
                ) &&
                b.state.pickups.size === pickups.length,
            `${pickups.length} of ${locations}`
        );
        check(
            'players start in the lobby as unready Farmers, each on their own team',
            phaseOf(a) === 'lobby' &&
                [me(a), me(b)].every((p) => p.character === 'farmer' && p.ready === false) &&
                me(a).teamId !== me(b).teamId &&
                me(a).color === shared.TEAMS[me(a).teamId].color
        );

        const named = await join(client, { name: '  Ada  ' });
        const twin = await join(client, { name: 'ada' });
        check(
            'a saved name sent on join is used, cleaned up and made unique',
            me(named).name === 'Ada' && me(twin).name === 'ada (1)',
            `${me(named).name}, ${me(twin).name}`
        );
        twin.send('setName', { name: 'Grace' });
        named.send('setName', { name: 'x' });
        await sleep(300);
        check(
            'players can rename in the lobby; invalid names are ignored',
            me(twin).name === 'Grace' && me(named).name === 'Ada'
        );
        named.leave(true);
        twin.leave(true);
        await sleep(300);

        b.send('selectTeam', { teamId: me(a).teamId });
        b.send('selectCharacter', { characterId: 'explorer' });
        await sleep(300);
        check(
            'a player can pick a team (color) and a character',
            me(b).teamId === me(a).teamId &&
                me(b).color === me(a).color &&
                me(b).character === 'explorer'
        );

        a.send('purchase', { itemId: 'ammo' });
        a.send('setReady', { ready: true });
        await sleep(300);
        check(
            'one player ready is not enough, and nothing can be bought in the lobby',
            phaseOf(a) === 'lobby' && me(a).ammo === 0
        );
        a.send('selectCharacter', { characterId: 'robot' });
        await sleep(300);
        check("a ready player's character is locked", me(a).character === 'farmer');

        b.send('setReady', { ready: true });
        await waitFor(() => phaseOf(a) === 'countdown', 3000);
        check(
            'everyone ready starts the countdown',
            phaseOf(a) === 'countdown' &&
                Math.abs(a.state.phase.endsAt - Date.now() - C.COUNTDOWN_DURATION_MS) < 500
        );
        const x0 = me(a).x;
        move(a, 1, 0);
        await sleep(400);
        check('nobody moves during the countdown', me(a).x === x0);

        b.send('setReady', { ready: false });
        await waitFor(() => phaseOf(a) === 'lobby', 3000);
        check('un-readying cancels the countdown', phaseOf(a) === 'lobby');

        b.send('setReady', { ready: true });
        await waitFor(() => phaseOf(a) === 'countdown', 3000);
        const c = await join(client);
        await waitFor(() => phaseOf(a) === 'lobby', 3000);
        check(
            'a newcomer (not ready yet) cancels the countdown',
            phaseOf(a) === 'lobby' && phaseOf(c) === 'lobby'
        );
        drop(c);
        await waitFor(() => phaseOf(a) === 'countdown', 3000);
        check(
            "a player who drops in the lobby doesn't hold the others up",
            phaseOf(a) === 'countdown'
        );
    });
}

async function lifecycle() {
    section('Match lifecycle (phase times scaled to 5%)');
    await withServer(0.05, async () => {
        const client = new Client(URL);
        const a = await join(client);
        const b = await join(client);
        b.send('selectCharacter', { characterId: 'explorer' });
        await sleep(200);
        await startMatch(a, b);
        check(
            'lobby -> countdown -> playing once everyone is ready',
            phaseOf(a) === 'playing' && a.phases.join('>') === 'countdown>playing',
            a.phases.join('>')
        );
        const farmer = shared.CHARACTERS.farmer;
        const explorer = shared.CHARACTERS.explorer;
        check(
            "each player starts the match with their character's kit",
            me(a).gun === '' &&
                me(a).ammo === farmer.ammo &&
                kitMaterials(me(a)) === farmer.materials &&
                Array.from(me(a).structureInventory).join() === farmer.structures.join() &&
                b.state.players.get(b.sessionId).gun === (explorer.gun ?? '') &&
                me(b).ammo === explorer.ammo &&
                me(b).armorLevel === (explorer.upgrades.armor ?? 0) &&
                me(b).health === me(b).maxHealth &&
                kitMaterials(me(b)) === explorer.materials
        );

        a.send('shoot', { angle: 0, seq: ++seq });
        await sleep(300);
        check('an unarmed player cannot shoot', a.state.projectiles.size === 0);

        // Nobody starts armed (since 2026-09-29): the Explorer fabricates a gun and ammo with the dev
        // materials.
        b.send('devMaterials');
        await waitFor(() => me(b).materials >= C.DEV_MATERIALS, 2000);
        b.send('purchase', { itemId: 'basicGun' });
        b.send('purchase', { itemId: 'ammo' });
        await waitFor(() => me(b).gun === 'basic' && me(b).ammo > 0, 2000);
        const before = { x: me(b).x, ammo: me(b).ammo };
        await hold(b, 1, 0, 1200);
        b.send('shoot', { angle: 0, seq: ++seq });
        await sleep(600);
        check(
            'during playing you can move, claim and shoot (with a gun)',
            me(b).x > before.x + 30 && me(b).tilesOwned > 0 && me(b).ammo === before.ammo - 1
        );
        check(
            'score = tiles while there are no kills or structures',
            me(b).score === me(b).tilesOwned,
            `score ${me(b).score}, tiles ${me(b).tilesOwned}`
        );

        // A structure needs all 7 hexes of its footprint: walk over a hex left of the spawn (away
        // from b's trail), then over each of its neighbors.
        const start = hexUnder(a);
        // Two hexes over, so the whole footprint is inside the spawn area, which is never terrain.
        const spot = { col: start.col - 2, row: start.row };
        const tryBuild = (structureType) =>
            a.send('placeStructure', {
                tileX: spot.col,
                tileY: spot.row,
                structureType,
                seq: ++seq,
            });
        await goTo(a, hexCenter(spot.col, spot.row));
        tryBuild('farm');
        await sleep(300);
        check(
            "you can't build unless all 7 footprint hexes are yours",
            a.state.structures.size === 0 && me(a).structureInventory.length === 1
        );
        for (const n of hexNeighbors(spot.col, spot.row)) await goTo(a, hexCenter(n.col, n.row));
        await sleep(300);
        const tiles = a.state.tiles;
        const ownsAll = structureFootprint(spot.col, spot.row).every(
            (h) => tiles[h.row * 64 + h.col].ownerId === a.sessionId
        );
        tryBuild('fort');
        await sleep(300);
        check(
            'you can only build what is in your inventory',
            ownsAll && a.state.structures.size === 0,
            ownsAll ? '' : 'did not manage to claim the whole footprint'
        );
        tryBuild('farm');
        await sleep(300);
        const built = Array.from(a.state.structures.values())[0];
        check(
            'building on a fully owned footprint uses up a structure from the inventory',
            !!built &&
                built.type === 'farm' &&
                built.tileX === spot.col &&
                me(a).structureInventory.length === 0
        );

        await waitFor(() => phaseOf(a) === 'results', 25000);
        await sleep(500);
        check('the match ends: playing -> results', phaseOf(a) === 'results');
        const standings = a.gameOver?.scores;
        check(
            'everyone receives the final standings',
            !!standings && !!b.gameOver && standings.length === 2
        );
        check(
            'standings are ordered best-first and carry name, color, team, score, tiles, kills, structures',
            !!standings &&
                standings[0].score >= standings[1].score &&
                ['name', 'color', 'teamId', 'score', 'tilesOwned', 'kills', 'structures'].every(
                    (k) => k in standings[0]
                )
        );

        check('the finished room is locked to newcomers', (await probe(a.roomId)) === 'LOCKED');
        const newcomer = await join(new Client(URL));
        check(
            'a newcomer lands in a fresh lobby instead',
            newcomer.roomId !== a.roomId && phaseOf(newcomer) === 'lobby'
        );
        newcomer.leave(true);

        let closedAt = null;
        a.onLeave(() => (closedAt = Date.now()));
        await waitFor(() => closedAt !== null, 8000);
        check(
            'the room closes when its results timer ends',
            closedAt !== null && Math.abs(closedAt - a.state.phase.endsAt) < 1500,
            closedAt ? `${closedAt - a.state.phase.endsAt} ms after the timer` : 'never closed'
        );
        check('...and is gone', (await probe(a.roomId)) === 'GONE');
    });

    section('A finished room closes as soon as the last player leaves');
    await withServer(0.05, async () => {
        const client = new Client(URL);
        const p = await join(client);
        const q = await join(client);
        await startMatch(p, q);
        await waitFor(() => phaseOf(p) === 'results', 25000);
        p.leave(true);
        await sleep(300);
        check(
            'one player leaving does not close it while another remains',
            (await probe(p.roomId)) === 'LOCKED'
        );
        const timerStillRunning = Date.now() < q.state.phase.endsAt;
        q.leave(true);
        await sleep(600);
        check(
            'the last player leaving closes it immediately',
            (await probe(p.roomId)) === 'GONE' && timerStillRunning
        );
    });
}

async function shop() {
    section('The shop over the wire');
    await withServer(0.05, async () => {
        const a = await join(new Client(URL));
        const robot = await join(new Client(URL));
        robot.send('selectCharacter', { characterId: 'robot' });
        await sleep(200);
        await startMatch(a, robot);

        // The Robot starts with Booster 1 equipped: enough to exercise the upgrade slot.
        const bot = () => robot.state.players.get(robot.sessionId);
        check(
            'the Robot starts with Booster 1 equipped',
            bot().boosterLevel === 1 && bot().equippedUpgrade === 'booster'
        );
        robot.send('equipUpgrade', { upgradeId: '' });
        await waitFor(() => bot().equippedUpgrade === '', 2000);
        robot.send('equipUpgrade', { upgradeId: 'booster' });
        await waitFor(() => bot().equippedUpgrade === 'booster', 2000);
        robot.send('equipUpgrade', { upgradeId: 'wings' });
        await sleep(300);
        check(
            'emptying the slot and switching straight back work (no cooldown); an unowned upgrade is refused',
            bot().equippedUpgrade === 'booster'
        );

        // A Farmer starts with 50 materials: not enough for an ammo pack (60 since weapons doubled
        // in price, 2026-09-29) or anything that costs 100 or more.
        const start = me(a).materials;
        for (const itemId of ['ammo', 'basicGun', 'expander', 'farm']) a.send('purchase', { itemId });
        await sleep(300);
        check(
            "items you can't afford are refused",
            me(a).gun === '' &&
                me(a).ammo === 0 &&
                me(a).claimRadius === C.BASE_CLAIM_RADIUS &&
                me(a).structureInventory.length === 1 &&
                me(a).materials === start
        );
        a.send('devMaterials');
        await sleep(300);
        check(
            'DEV: the devMaterials message (the M key) adds DEV_MATERIALS',
            me(a).materials === start + C.DEV_MATERIALS
        );
        const rich = me(a).materials;
        a.send('purchase', { itemId: 'ammo' });
        await sleep(300);
        check(
            'buying ammo over the wire costs its price and adds the pack',
            me(a).ammo === shared.AMMO_PACK_SIZE &&
                me(a).materials === rich - shared.SHOP_ITEMS.ammo.cost
        );

        const late = await join(new Client(URL));
        check(
            'someone joining mid-match plays the default character, kit included',
            phaseOf(late) === 'playing' &&
                me(late).character === shared.DEFAULT_CHARACTER &&
                kitMaterials(me(late)) === shared.CHARACTERS[shared.DEFAULT_CHARACTER].materials
        );
    });
}

async function connection() {
    section('Disconnect and reconnect');
    await withServer(0.05, async () => {
        const client = new Client(URL);
        const a = await join(client);
        const b = await join(client);
        const c = await join(client);
        await startMatch(a, b, c);

        const token = b.reconnectionToken;
        const bId = b.sessionId;
        drop(b);
        // Broadcast messages go out at once, but state changes ride the next patch (every 50 ms),
        // so the notice can arrive before `connected` flips. Wait for both, not just the notice.
        await waitFor(
            () =>
                a.inbox.length > 0 &&
                c.inbox.length > 0 &&
                a.state.players.get(bId)?.connected === false,
            3000
        );
        const heard = (room) => room.inbox.find((m) => m.type === 'disconnected');
        check(
            'the dropped player is marked disconnected',
            a.state.players.get(bId).connected === false
        );
        check(
            'every other player is told, with the name and reconnect window',
            !!heard(a) &&
                !!heard(c) &&
                heard(a).playerId === bId &&
                heard(a).name === a.state.players.get(bId).name &&
                heard(a).reconnectWindowMs === C.RECONNECT_WINDOW_SECONDS * 1000
        );

        const returned = await new Client(URL).reconnect(token);
        const own = [];
        returned.onMessage('playerReconnected', (m) => own.push(m));
        returned.onMessage('*', () => {});
        await waitFor(
            () =>
                a.inbox.some((m) => m.type === 'reconnected') &&
                a.state.players.get(bId)?.connected === true,
            3000
        );
        await sleep(300); // time for a (wrong) self-notice to arrive, for the last check below
        check('the player is connected again', a.state.players.get(bId).connected === true);
        check(
            'every other player is told they came back',
            a.inbox.some((m) => m.type === 'reconnected' && m.playerId === bId) &&
                c.inbox.some((m) => m.type === 'reconnected' && m.playerId === bId)
        );
        check('...but the returning player is not told about themselves', own.length === 0);
    });
}

async function pickups() {
    // Plain ground, so the walk to the nearest pickup is never blocked.
    section('Pickups (over the wire)');
    await withServer(
        0.2,
        async () => {
            const a = await join(new Client(URL));
            await startMatch(a);
            const distance = (p) => {
                const at = hexCenter(p.tileX, p.tileY);
                return Math.hypot(at.x - me(a).x, at.y - me(a).y);
            };
            const nearest = Array.from(a.state.pickups.values()).sort(
                (p, q) => distance(p) - distance(q)
            )[0];
            let event = null;
            a.onMessage('pickupCollected', (e) => (event = e));
            const before = { ammo: me(a).ammo };
            // Every pod is the same on the map; its contents come with pickupCollected.
            check(
                'pods carry no contents in the synced state',
                Object.keys(nearest.toJSON()).sort().join() === 'id,tileX,tileY'
            );
            await goTo(a, hexCenter(nearest.tileX, nearest.tileY), 15000);
            await waitFor(() => !a.state.pickups.has(nearest.id), 2000);
            check(
                'walking onto a pickup takes it: it leaves the map and pickupCollected is sent',
                !a.state.pickups.has(nearest.id) && event?.playerId === a.sessionId,
                event ? `${event.kind} ${event.itemId || event.amount}` : 'no event'
            );
            if (event?.kind === 'ammo') {
                const ammo = me(a).ammo;
                check('...an ammo pile adds its shots', ammo === before.ammo + event.amount);
            }
        },
        { TERRAIN_COVERAGE: '0' }
    );
    section('Pickups feature flag');
    await withServer(
        0.2,
        async () => {
            const a = await join(new Client(URL));
            check('PICKUPS=0 turns pickups off: the map has none', a.state.pickups.size === 0);
        },
        { PICKUPS: '0' }
    );
}

/** GET /games on the test server. */
function fetchGames() {
    return new Promise((resolve, reject) => {
        http.get({ host: 'localhost', port: PORT, path: '/games' }, (res) => {
            let body = '';
            res.on('data', (chunk) => (body += chunk));
            res.on('end', () => resolve(JSON.parse(body)));
        }).on('error', reject);
    });
}

async function games() {
    section('Creating, listing and joining games');
    await withServer(0.2, async () => {
        const client = new Client(URL);
        const settings = { name: 'E2E game', mapSize: 'big', teams: false, pods: false, matchMinutes: 10 };
        const a = await client.create('GameRoom', { name: 'Host', game: settings });
        if (!a.state?.phase) await new Promise((resolve) => a.onStateChange.once(resolve));
        const code = a.roomId;
        check(
            'a created game gets a short code as its id, and the settings it was created with',
            shared.normalizeGameCode(code) === code &&
                a.state.settings.name === 'E2E game' &&
                a.state.settings.matchMinutes === 10 &&
                a.state.settings.teams === false &&
                a.state.mapWidth === shared.MAP_SIZES.big.cols &&
                a.state.tiles.length === shared.MAP_SIZES.big.cols * shared.MAP_SIZES.big.rows,
            code
        );
        check('...drop pods off means no pods on the map', a.state.pickups.size === 0);

        const other = await client.create('GameRoom', {});
        let listed = await fetchGames();
        const ours = listed.find((g) => g.code === code);
        check(
            'GET /games lists open games with their settings and player counts',
            listed.length === 2 &&
                !!ours &&
                ours.name === 'E2E game' &&
                ours.mapSize === 'big' &&
                ours.players === 1 &&
                ours.phase === 'lobby' &&
                listed.some((g) => g.code === other.roomId && g.name === `Game ${other.roomId}`),
            JSON.stringify(listed.map((g) => [g.code, g.name, g.players]))
        );

        const b = await client.joinById(code, { name: 'Guest' });
        if (!b.state?.phase) await new Promise((resolve) => b.onStateChange.once(resolve));
        await waitFor(() => a.state.players.size === 2, 2000);
        check('joining by code puts you in that game', b.roomId === code && a.state.players.size === 2);

        const teamBefore = b.state.players.get(b.sessionId).teamId;
        b.send('selectTeam', { teamId: me(a).teamId });
        await sleep(300);
        check(
            "with teams off, a color someone else has can't be picked",
            b.state.players.get(b.sessionId).teamId === teamBefore && teamBefore !== me(a).teamId
        );
        const free = shared.TEAM_IDS.find((id) => id !== me(a).teamId && id !== teamBefore);
        b.send('selectTeam', { teamId: free });
        await waitFor(() => b.state.players.get(b.sessionId).teamId === free, 2000);
        check(
            '...but a free color can',
            b.state.players.get(b.sessionId).color === shared.TEAMS[free].color
        );

        a.send('setReady', { ready: true });
        b.send('setReady', { ready: true });
        await waitFor(() => phaseOf(a) === 'playing', 5000);
        const length = a.state.phase.endsAt - Date.now();
        check(
            'the match lasts the chosen length (10 minutes, scaled)',
            Math.abs(length - 10 * 60_000 * 0.2) < 2000,
            `${Math.round(length)} ms`
        );
        listed = await fetchGames();
        check(
            'the list shows a game in play as playing',
            listed.find((g) => g.code === code)?.phase === 'playing'
        );
        await other.leave();
    });
}

async function bots() {
    section('Bots (single player)');
    await withServer(0.2, async () => {
        const client = new Client(URL);
        const a = await client.create('GameRoom', { name: 'Solo', game: { name: 'Solo game' } });
        if (!a.state?.phase) await new Promise((resolve) => a.onStateChange.once(resolve));
        a.onMessage('*', () => {});
        const code = a.roomId;
        const botsIn = () => Array.from(a.state.players.values()).filter((p) => p.bot);

        a.send('addBot', { difficulty: 'hard' });
        a.send('addBot', { difficulty: 'easy' });
        await waitFor(() => botsIn().length === 2, 2000);
        check(
            'addBot adds ready bots with the difficulty asked for',
            botsIn().every((b) => b.ready) &&
                botsIn()
                    .map((b) => b.botDifficulty)
                    .sort()
                    .join() === 'easy,hard',
            botsIn()
                .map((b) => `${b.name}:${b.botDifficulty}`)
                .join(' ')
        );
        const easy = botsIn().find((b) => b.botDifficulty === 'easy');
        a.send('updateBot', { botId: easy.id, difficulty: 'medium', characterId: 'robot' });
        await waitFor(() => easy.botDifficulty === 'medium', 2000);
        check('updateBot changes its difficulty and character', easy.character === 'robot');

        let listed = (await fetchGames()).find((g) => g.code === code);
        check(
            'the game list counts bots as players',
            listed?.players === 3 && listed?.bots === 2 && listed?.maxPlayers === 10,
            JSON.stringify(listed)
        );

        for (let i = 0; i < 8; i++) a.send('addBot', { difficulty: 'easy' });
        await waitFor(() => a.state.players.size === 10, 2000);
        await sleep(300);
        check(
            'bots fill the game to 10 players, and no further',
            a.state.players.size === 10 && botsIn().length === 9
        );
        check("a full game (you and 9 bots) doesn't let anyone else in", (await probe(code)) === 'LOCKED');
        a.send('removeBot', { botId: easy.id });
        await waitFor(() => a.state.players.size === 9, 2000);
        check('removeBot removes one, and a seat opens again', (await probe(code)) === 'OPEN');
        await waitFor(() => a.state.players.size === 9, 2000); // the probe has left again

        const spawns = new Map(botsIn().map((b) => [b.id, [b.x, b.y]]));
        await startMatch(a);
        check('you plus bots: the match starts as soon as you are ready', phaseOf(a) === 'playing');
        a.send('addBot', { difficulty: 'easy' });
        await sleep(4000);
        const moved = botsIn().filter((b) => {
            const [x, y] = spawns.get(b.id);
            return Math.hypot(b.x - x, b.y - y) > 60 && b.tilesOwned >= 3;
        });
        check(
            'in the match the bots move off their spawns and claim hexes',
            moved.length === botsIn().length,
            botsIn()
                .map((b) => `${b.botDifficulty}:${b.tilesOwned}`)
                .join(' ')
        );
        check('no adding bots once the match is on', botsIn().length === 8);
    });
}

async function backpacks() {
    // Plain ground, so the shots and the walks aren't stopped by a mountain.
    section('Defeat, respawn delay and backpacks');
    await withServer(
        0.2,
        async () => {
            const a = await join(new Client(URL), { name: 'Shooter' });
            const b = await join(new Client(URL), { name: 'Robot' });
            const collected = [];
            a.onMessage('backpackCollected', (m) => collected.push(['a', m]));
            b.onMessage('backpackCollected', (m) => collected.push(['b', m]));
            b.send('selectCharacter', { characterId: 'robot' }); // Booster 1, equipped
            await sleep(300);
            await startMatch(a, b);
            a.send('devMaterials'); // the shooter fabricates a Basic gun and ammo
            await waitFor(() => me(a).materials >= C.DEV_MATERIALS, 2000);
            a.send('purchase', { itemId: 'basicGun' });
            a.send('purchase', { itemId: 'ammo' });
            await waitFor(() => me(b).boosterLevel === 1 && me(a).gun === 'basic' && me(a).ammo > 0, 2000);

            // The robot walks a few hexes west of its spawn, then the shooter fires twice at it.
            const spawn = { x: me(b).x, y: me(b).y };
            await goTo(b, { x: spawn.x - 150, y: spawn.y });
            const fallen = pixelToHex(me(b).x, me(b).y);
            for (let i = 0; i < 2 && me(b).respawnAt === 0; i++) {
                const angle = Math.atan2(me(b).y - me(a).y, me(b).x - me(a).x);
                a.send('shoot', { angle, seq: ++seq });
                await waitFor(() => me(b).health < 100 || me(b).respawnAt > 0, 3000);
                await sleep(250);
            }
            await waitFor(() => b.state.backpacks.size === 1, 2000);
            const pack = Array.from(b.state.backpacks.values())[0];
            check(
                'two basic-gun hits: the robot is down (respawnAt set) and its Booster is gone',
                me(b).respawnAt > Date.now() && me(b).boosterLevel === 0 && me(a).kills === 1,
                `respawnAt in ${me(b).respawnAt - Date.now()} ms`
            );
            check(
                'its backpack lies where it fell, and only its own client gets it',
                pack?.tileX === fallen.col &&
                    pack?.tileY === fallen.row &&
                    a.state.backpacks.size === 0 &&
                    b.state.players.get(a.sessionId).respawnAt === 0,
                pack ? `at ${pack.tileX},${pack.tileY} vs ${fallen.col},${fallen.row}` : 'none'
            );
            const others = a.state.players.get(b.sessionId);
            check('...and everyone sees it down', others.respawnAt > 0);
            const downAt = { x: me(b).x, y: me(b).y };
            await hold(b, -1, 0, 600); // a down player can't move
            check(
                "while down it can't move",
                Math.hypot(me(b).x - downAt.x, me(b).y - downAt.y) < 1
            );

            await waitFor(() => me(b).respawnAt === 0, C.RESPAWN_DELAY_MS + 2000);
            check(
                `it respawns at its spawn after ${C.RESPAWN_DELAY_MS / 1000} s, with full health`,
                Math.hypot(me(b).x - spawn.x, me(b).y - spawn.y) < 5 && me(b).health === 100
            );
            await goTo(b, hexCenter(pack.tileX, pack.tileY));
            await waitFor(() => b.state.backpacks.size === 0, 2000);
            await sleep(300);
            check(
                'walking onto it gives the Booster back, and only its owner is told',
                me(b).boosterLevel === 1 &&
                    me(b).equippedUpgrade === 'booster' &&
                    collected.length === 1 &&
                    collected[0][0] === 'b' &&
                    collected[0][1].contents === 'Booster 1',
                JSON.stringify(collected)
            );
        },
        { TERRAIN_COVERAGE: '0', PICKUPS: '0' }
    );
}

async function edges() {
    // A map of plain ground: this walks from the spawn to the edges, and terrain in the way
    // would stop it (terrain movement is unit-tested in server/src/systems/terrainRules.spec.ts).
    section('The map edge (over the wire)');
    await withServer(
        0.2,
        async () => {
            const a = await join(new Client(URL));
            await startMatch(a);
            const push = async (x, y, done) => {
                const end = Date.now() + 12000;
                while (Date.now() < end && !done(me(a))) {
                    move(a, x, y);
                    await sleep(100);
                }
                move(a, 0, 0);
                await sleep(400);
            };
            // The spawn line is near the right-hand edge, so push into that corner. (Bottom, not
            // top: the last column is an odd one, shifted down half a hex, so the top-right corner
            // of the map rectangle is off the hex grid.)
            const { width, height } = mapPixelSize(64, 64);
            const right = width - C.MAP_EDGE_MARGIN;
            const bottom = height - C.MAP_EDGE_MARGIN;
            await push(1, 0, (p) => p.x >= right - 0.5);
            check(
                'pushing hard into the right edge stops at MAP_EDGE_MARGIN',
                Math.abs(me(a).x - right) < 0.5,
                `x=${me(a).x.toFixed(1)}`
            );
            await push(0, 1 / C.SCREEN_Y_SCALE, (p) => p.y >= bottom - 0.5);
            check(
                '...and into the bottom edge',
                Math.abs(me(a).y - bottom) < 0.5,
                `y=${me(a).y.toFixed(1)}`
            );
            const hex = pixelToHex(me(a).x, me(a).y);
            check(
                'the player is still standing on the map',
                hex.col >= 0 && hex.row >= 0 && hex.col < 64 && hex.row < 64
            );
        },
        { TERRAIN_COVERAGE: '0' }
    );
}

(async () => {
    try {
        await lobby();
        await lifecycle();
        await shop();
        await connection();
        await pickups();
        await games();
        await bots();
        await backpacks();
        await edges();
    } catch (error) {
        check('the e2e run completed without an error', false, error.message);
    }
    finish();
})();
