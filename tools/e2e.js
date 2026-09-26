#!/usr/bin/env node
// End-to-end checks: starts its own throwaway server (private port, phase times scaled down with
// PHASE_TIME_SCALE) and drives real colyseus.js clients through it. It never touches your dev
// server. Takes about a minute.
//
//   cd server && npm run build && cd .. && node tools/e2e.js
//
// Backs the claims in docs/ARCHITECTURE.md under Game Mechanics (Game Phases, Shop), Room
// Lifecycle (closing a finished room), and Reconnection System (notifications, host handover).

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
    room.onMessage('gameOver', (m) => (room.gameOver = m));
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
const drop = (room) => room.connection.transport.ws.close(4001); // an unclean close, like a network drop

// ---------------------------------------------------------------------------------------------
async function lifecycle() {
    section('Match lifecycle (phase times scaled to 5%)');
    await withServer(0.05, async () => {
        const client = new Client(URL);
        const a = await join(client); // host
        const b = await join(client);
        check(
            'players start in the lobby with the starting credits',
            phaseOf(a) === 'lobby' && me(a).credits === C.STARTING_CREDITS
        );

        a.send('purchase', { itemId: 'ammo' });
        await sleep(300);
        check(
            'buying is refused in the lobby',
            me(a).credits === C.STARTING_CREDITS && me(a).ammo === 30
        );

        a.send('startGame');
        await waitFor(() => phaseOf(a) === 'buying', 3000);
        check('the host starts the game: lobby -> buying', phaseOf(a) === 'buying');

        const x0 = me(a).x;
        move(a, 1, 0);
        a.send('shoot', { angle: 0, seq: ++seq });
        await sleep(500);
        check(
            'during buying nobody moves, shoots or claims',
            me(a).x === x0 && me(a).ammo === 30 && me(a).tilesOwned === 0
        );

        b.send('endBuying');
        await sleep(300);
        check("a non-host can't end the buying phase", phaseOf(a) === 'buying');

        a.send('purchase', { itemId: 'ammo' });
        await sleep(300);
        check(
            'buying an ammo pack works during the buying phase',
            me(a).credits === C.STARTING_CREDITS - shared.SHOP_ITEMS.ammo.cost &&
                me(a).ammo === 30 + shared.AMMO_PACK_SIZE
        );

        a.send('endBuying');
        await waitFor(() => phaseOf(a) === 'playing', 3000);
        check('the host can end buying early: buying -> playing', phaseOf(a) === 'playing');

        a.send('purchase', { itemId: 'expander' });
        await sleep(300);
        check("an item you can't afford is refused", me(a).claimRadius === C.BASE_CLAIM_RADIUS);

        const before = { x: me(a).x, ammo: me(a).ammo };
        await hold(a, 1, 0, 1200);
        a.send('shoot', { angle: 0, seq: ++seq });
        await sleep(600);
        check(
            'during playing you can move, claim and shoot',
            me(a).x > before.x + 30 && me(a).tilesOwned > 0 && me(a).ammo === before.ammo - 1
        );
        check(
            'score = tiles while there are no kills or structures',
            me(a).score === me(a).tilesOwned,
            `score ${me(a).score}, tiles ${me(a).tilesOwned}`
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
            'standings are ordered best-first and carry name, color, score, tiles, kills, structures',
            !!standings &&
                standings[0].playerId === a.sessionId &&
                standings[0].score >= standings[1].score &&
                ['name', 'color', 'score', 'tilesOwned', 'kills', 'structures'].every(
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
        p.send('startGame');
        await waitFor(() => phaseOf(p) === 'buying', 3000);
        p.send('endBuying');
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

async function shopAndClaiming() {
    section('The Expander over the wire');
    await withServer(0.05, async () => {
        const a = await join(new Client(URL));
        a.send('startGame');
        await waitFor(() => phaseOf(a) === 'buying', 3000);
        a.send('purchase', { itemId: 'expander' });
        await sleep(300);
        check(
            'buying the Expander costs its price and sets the claim radius',
            me(a).credits === C.STARTING_CREDITS - shared.SHOP_ITEMS.expander.cost &&
                me(a).claimRadius === C.EXPANDER_CLAIM_RADIUS
        );
        a.send('purchase', { itemId: 'expander' });
        await sleep(300);
        check(
            'a second Expander is refused',
            me(a).credits === C.STARTING_CREDITS - shared.SHOP_ITEMS.expander.cost
        );
        a.send('endBuying');
        await waitFor(() => phaseOf(a) === 'playing', 3000);
        await sleep(600);
        check(
            'an Expander owner claims several hexes at once',
            me(a).tilesOwned > 1,
            `${me(a).tilesOwned} tiles`
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
        a.send('startGame');
        await waitFor(() => phaseOf(a) === 'buying', 3000);
        a.send('endBuying');
        await waitFor(() => phaseOf(a) === 'playing', 3000);

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

    section('Host handover');
    await withServer(0.05, async () => {
        const client = new Client(URL);
        const host = await join(client);
        const other = await join(client);
        drop(host);
        await sleep(600);
        other.send('startGame');
        await waitFor(() => phaseOf(other) === 'buying', 3000);
        check(
            'when the host drops, the next player can start the game at once',
            phaseOf(other) === 'buying'
        );
    });
    await withServer(0.05, async () => {
        const lone = await join(new Client(URL));
        const roomId = lone.roomId;
        drop(lone);
        await sleep(600);
        const newcomer = await new Client(URL).joinById(roomId);
        if (!newcomer.state?.phase)
            await new Promise((resolve) => newcomer.onStateChange.once(resolve));
        newcomer.onMessage('*', () => {});
        newcomer.send('startGame');
        await waitFor(() => phaseOf(newcomer) === 'buying', 3000);
        check(
            'a newcomer takes over when the only host is disconnected',
            phaseOf(newcomer) === 'buying'
        );
    });
}

async function edges() {
    section('The map edge (over the wire)');
    await withServer(0.2, async () => {
        const a = await join(new Client(URL));
        a.send('startGame');
        await waitFor(() => phaseOf(a) === 'buying', 3000);
        a.send('endBuying');
        await waitFor(() => phaseOf(a) === 'playing', 3000);
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
        await lifecycle();
        await shopAndClaiming();
        await connection();
        await edges();
    } catch (error) {
        check('the e2e run completed without an error', false, error.message);
    }
    finish();
})();
