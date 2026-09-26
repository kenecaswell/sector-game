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
const { root, dist, colyseusClient, section, check, finish, sleep } = require('./lib');

const { Client } = colyseusClient();
const { pixelToHex } = dist('hex.js');
const C = dist('constants.js');
const shared = dist('types/shared.js');

const PORT = 2598;
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
async function withServer(scale, fn) {
    if (await healthy()) throw new Error(`port ${PORT} is already in use`);
    const child = spawn(process.execPath, [path.join(root, 'server', 'dist', 'index.js')], {
        env: { ...process.env, PORT: String(PORT), PHASE_TIME_SCALE: String(scale) },
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

async function join(client) {
    const room = await client.joinOrCreate('GameRoom');
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
const hexUnder = (room) => pixelToHex(me(room).x, me(room).y);
const drop = (room) => room.connection.transport.ws.close(4001); // an unclean close, like a network drop

// ---------------------------------------------------------------------------------------------
async function lobby() {
    section('The lobby (real phase times)');
    await withServer(1, async () => {
        const client = new Client(URL);
        const a = await join(client);
        const b = await join(client);
        check(
            'players start in the lobby as unready Farmers, each on their own team',
            phaseOf(a) === 'lobby' &&
                [me(a), me(b)].every((p) => p.character === 'farmer' && p.ready === false) &&
                me(a).teamId !== me(b).teamId &&
                me(a).color === shared.TEAMS[me(a).teamId].color
        );

        b.send('selectTeam', { teamId: me(a).teamId });
        b.send('selectCharacter', { characterId: 'smuggler' });
        await sleep(300);
        check(
            'a player can pick a team (color) and a character',
            me(b).teamId === me(a).teamId &&
                me(b).color === me(a).color &&
                me(b).character === 'smuggler'
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
        b.send('selectCharacter', { characterId: 'smuggler' });
        await sleep(200);
        await startMatch(a, b);
        check(
            'lobby -> countdown -> playing once everyone is ready',
            phaseOf(a) === 'playing' && a.phases.join('>') === 'countdown>playing',
            a.phases.join('>')
        );
        const farmer = shared.CHARACTERS.farmer;
        const smuggler = shared.CHARACTERS.smuggler;
        check(
            "each player starts the match with their character's kit",
            me(a).gun === '' &&
                me(a).ammo === farmer.ammo &&
                me(a).credits === farmer.credits &&
                Array.from(me(a).structureInventory).join() === farmer.structures.join() &&
                b.state.players.get(b.sessionId).gun === smuggler.gun &&
                me(b).ammo === smuggler.ammo &&
                me(b).credits === smuggler.credits
        );

        a.send('shoot', { angle: 0, seq: ++seq });
        await sleep(300);
        check('an unarmed player cannot shoot', a.state.projectiles.size === 0);

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

        await hold(a, -1, 0, 600);
        await sleep(300);
        const spot = hexUnder(a);
        a.send('placeStructure', { tileX: spot.col, tileY: spot.row, structureType: 'fort' });
        await sleep(300);
        check('you can only build what is in your inventory', a.state.structures.size === 0);
        a.send('placeStructure', { tileX: spot.col, tileY: spot.row, structureType: 'farm' });
        await sleep(300);
        const built = Array.from(a.state.structures.values())[0];
        check(
            'building uses up a structure from the inventory',
            !!built && built.type === 'farm' && me(a).structureInventory.length === 0
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
        await startMatch(a);
        const start = me(a).credits;
        a.send('purchase', { itemId: 'expander' });
        await sleep(300);
        check(
            "an item you can't afford is refused",
            me(a).claimRadius === C.BASE_CLAIM_RADIUS && me(a).credits === start
        );
        a.send('purchase', { itemId: 'basicGun' });
        await sleep(300);
        check(
            'buying the Basic gun costs its price and arms you',
            me(a).gun === 'basic' && me(a).credits === start - shared.SHOP_ITEMS.basicGun.cost
        );
        a.send('purchase', { itemId: 'basicGun' });
        await sleep(300);
        check('a second gun is refused', me(a).credits === start - shared.SHOP_ITEMS.basicGun.cost);

        const late = await join(new Client(URL));
        check(
            'someone joining mid-match plays the default character, kit included',
            phaseOf(late) === 'playing' &&
                me(late).character === shared.DEFAULT_CHARACTER &&
                me(late).credits === shared.CHARACTERS[shared.DEFAULT_CHARACTER].credits
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
        await waitFor(() => a.inbox.length > 0 && c.inbox.length > 0, 3000);
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
        await waitFor(() => a.inbox.some((m) => m.type === 'reconnected'), 3000);
        await sleep(300);
        check('the player is connected again', a.state.players.get(bId).connected === true);
        check(
            'every other player is told they came back',
            a.inbox.some((m) => m.type === 'reconnected' && m.playerId === bId) &&
                c.inbox.some((m) => m.type === 'reconnected' && m.playerId === bId)
        );
        check('...but the returning player is not told about themselves', own.length === 0);
    });
}

async function edges() {
    section('The map edge (over the wire)');
    await withServer(0.2, async () => {
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
        await push(-1, 0, (p) => p.x <= C.MAP_EDGE_MARGIN + 0.5);
        check(
            'pushing hard into the left edge stops at MAP_EDGE_MARGIN',
            Math.abs(me(a).x - C.MAP_EDGE_MARGIN) < 0.5,
            `x=${me(a).x.toFixed(1)}`
        );
        await push(0, -1 / C.SCREEN_Y_SCALE, (p) => p.y <= C.MAP_EDGE_MARGIN + 0.5);
        check(
            '...and into the top edge',
            Math.abs(me(a).y - C.MAP_EDGE_MARGIN) < 0.5,
            `y=${me(a).y.toFixed(1)}`
        );
        const hex = pixelToHex(me(a).x, me(a).y);
        check(
            'the player is still standing on the map',
            hex.col >= 0 && hex.row >= 0 && hex.col < 64 && hex.row < 64
        );
    });
}

(async () => {
    try {
        await lobby();
        await lifecycle();
        await shop();
        await connection();
        await edges();
    } catch (error) {
        check('the e2e run completed without an error', false, error.message);
    }
    finish();
})();
