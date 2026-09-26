#!/usr/bin/env node
// Geometry-heavy checks against the compiled server: players vs. structures (sliding, never
// overlapping, never freezing) and projectiles (uniform on-screen speed, no skipping over players).
//
//   cd server && npm run build && cd .. && node tools/check-collisions.js
//
// Backs the claims in docs/ARCHITECTURE.md under Collision Detection and Destructible Structures.

const { dist, section, check, finish } = require('./lib');

const { GameState, Player, Structure, Projectile } = dist('state/GameState.js');
const { MovementSystem } = dist('systems/MovementSystem.js');
const { CombatSystem } = dist('systems/CombatSystem.js');
const { hexCenter, structureContact } = dist('hex.js');
const C = dist('constants.js');

const DT = 1 / C.TICK_RATE;
const SQ = C.SCREEN_Y_SCALE;

function world() {
    const state = new GameState();
    state.mapWidth = 64;
    state.mapHeight = 64;
    state.phase.phase = 'playing';
    return state;
}

// ---------------------------------------------------------------------------------------------
section('Structures (the 7-hex hexagon) are solid to everyone but their owner');
{
    const center = hexCenter(10, 10);
    let approaches = 0;
    let overlaps = 0;
    let frozen = 0;
    let wallStops = 0;
    let closest = Infinity;

    // Walk a non-owner into the structure's hexagon from every direction and offset (it's ~170px
    // across, so start 260px out and sweep offsets across its whole width), holding the
    // input for a long time. They must slide around it: never overlap it, never freeze while
    // still pushing sideways. (Walking dead-on into a flat wall just stops, like any wall.)
    for (let angle = 0; angle < 360; angle += 15) {
        for (let offset = -130; offset <= 130; offset += 8) {
            const a = (angle * Math.PI) / 180;
            const dir = { x: Math.cos(a), y: Math.sin(a) };
            const state = world();
            const structure = new Structure();
            structure.id = 's';
            structure.ownerId = 'owner';
            structure.tileX = 10;
            structure.tileY = 10;
            state.structures.set('s', structure);
            const player = new Player();
            player.id = 'enemy';
            player.x = center.x - dir.x * 260 - dir.y * offset;
            player.y = center.y - dir.y * 260 + dir.x * offset;
            state.players.set('enemy', player);
            const inputs = new Map([['enemy', { dir, seq: 1, receivedAt: Date.now() }]]);

            let lastMoved = 0;
            let previous = { x: player.x, y: player.y };
            for (let tick = 0; tick < 160; tick++) {
                inputs.get('enemy').receivedAt = Date.now();
                MovementSystem.update(state, inputs, DT);
                closest = Math.min(closest, structureContact(player.x, player.y, 10, 10).distance);
                if (Math.hypot(player.x - previous.x, player.y - previous.y) > 0.5)
                    lastMoved = tick;
                previous = { x: player.x, y: player.y };
            }
            approaches++;
            if (structureContact(player.x, player.y, 10, 10).distance < C.PLAYER_RADIUS - 0.5)
                overlaps++;
            const mid = player.x > 50 && player.x < 3000 && player.y > 50 && player.y < 3500;
            if (lastMoved < 150 && mid) {
                const n = structureContact(player.x, player.y, 10, 10);
                const sideways = Math.abs(dir.x * -n.ny + dir.y * n.nx);
                if (sideways > 0.1) frozen++;
                else wallStops++;
            }
        }
    }
    check(
        `no overlaps across ${approaches} approaches`,
        overlaps === 0,
        `closest ${closest.toFixed(1)}px, needs >= ${C.PLAYER_RADIUS}`
    );
    check(
        'nobody freezes while still pushing sideways',
        frozen === 0,
        `${frozen} frozen; ${wallStops} dead-on wall stops (expected)`
    );
}
{
    // The owner walks straight through their own structure; a player trapped inside can leave.
    const center = hexCenter(10, 10);
    const run = (playerId, startX, startY, dir, ticks) => {
        const state = world();
        const structure = new Structure();
        structure.id = 's';
        structure.ownerId = 'owner';
        structure.tileX = 10;
        structure.tileY = 10;
        state.structures.set('s', structure);
        const player = new Player();
        player.id = playerId;
        player.x = startX;
        player.y = startY;
        state.players.set(playerId, player);
        const inputs = new Map([[playerId, { dir, seq: 1, receivedAt: Date.now() }]]);
        let deepest = Infinity;
        for (let i = 0; i < ticks; i++) {
            inputs.get(playerId).receivedAt = Date.now();
            MovementSystem.update(state, inputs, DT);
            deepest = Math.min(deepest, structureContact(player.x, player.y, 10, 10).distance);
        }
        return { player, deepest };
    };
    const owner = run('owner', center.x - 260, center.y, { x: 1, y: 0 }, 60);
    check(
        'the owner walks straight through their own structure',
        owner.deepest < 0 && owner.player.x > center.x + 40
    );
    const trapped = run('enemy', center.x, center.y, { x: 1, y: 0 }, 40);
    check('a player standing inside a structure can walk out', trapped.player.x > center.x + 40);
}

// ---------------------------------------------------------------------------------------------
section('Projectiles');
{
    const fire = (state, angle) => {
        const p = new Projectile();
        p.id = `p${Math.random()}`;
        p.ownerId = 'shooter';
        p.x = 1500;
        p.y = 1500;
        p.angle = angle;
        p.spawnedAt = Date.now();
        state.projectiles.set(p.id, p);
        return p;
    };
    for (const [label, degrees] of [
        ['right', 0],
        ['down', 90],
        ['up', -90],
        ['down-right', 45],
        ['left', 180],
    ]) {
        const state = world();
        const p = fire(state, (degrees * Math.PI) / 180);
        const x0 = p.x;
        const y0 = p.y;
        for (let i = 0; i < 10; i++) CombatSystem.update(state, DT, () => {});
        const onScreen = Math.hypot(p.x - x0, (p.y - y0) * SQ);
        const expected = (p.speed * 10) / C.TICK_RATE;
        check(
            `on-screen projectile speed is uniform: ${label}`,
            Math.abs(onScreen - expected) < 0.5,
            `${onScreen.toFixed(0)} vs ${expected.toFixed(0)} px per 0.5 s`
        );
    }

    // Shots move 20-33 world px per tick against a hit radius of PLAYER_RADIUS + PROJECTILE_RADIUS,
    // so an end-point-only hit test would let grazing shots skip a player. The swept test must not.
    const hitRate = (angleDegrees, lateralOffset) => {
        let hits = 0;
        const trials = 300;
        for (let n = 0; n < trials; n++) {
            const state = world();
            const a = (angleDegrees * Math.PI) / 180;
            const dx = Math.cos(a);
            const dy = Math.sin(a);
            const target = new Player();
            target.id = 't';
            target.x = 1500 - dy * lateralOffset + dx * 300;
            target.y = 1500 + dx * lateralOffset + dy * 300;
            state.players.set('t', target);
            const p = fire(state, a);
            const step = (p.speed * DT) / Math.hypot(dx, dy * SQ);
            const phase = Math.random(); // start somewhere within one tick's travel
            p.x -= dx * step * phase;
            p.y -= dy * step * phase;
            for (let i = 0; i < 40 && state.projectiles.size > 0; i++) {
                CombatSystem.update(state, DT, () => {});
                if (target.health < 100) {
                    hits++;
                    break;
                }
            }
        }
        return hits / trials;
    };
    const reach = C.PLAYER_RADIUS + C.PROJECTILE_RADIUS;
    const offsets = [0, reach * 0.5, reach * 0.8, reach * 0.95];
    const misses = [];
    for (const [label, degrees] of [
        ['sideways', 0],
        ['vertical', 90],
    ]) {
        for (const offset of offsets) {
            const rate = hitRate(degrees, offset);
            if (rate < 1)
                misses.push(`${label} @${offset.toFixed(0)}px: ${(rate * 100).toFixed(0)}%`);
        }
    }
    check(
        'shots inside the hit radius always hit, sideways and vertical (no tunneling)',
        misses.length === 0,
        misses.join('; ')
    );
}

finish();
