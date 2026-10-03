#!/usr/bin/env node
// Headless bot match, for tuning the bots' difficulty profiles (BOT_PROFILES in
// server/src/constants.ts): runs the real server systems on a virtual clock, much faster than real
// time, with no clients and no network, and prints how each bot did. Not a pass/fail check.
//
//   node tools/bot-sim.js [difficulties=easy,medium,hard] [minutes=5] [seed=1] [mapSize=small] [teams=0]
//
//   node tools/bot-sim.js hard                       # one Hard bot alone: how much can it claim?
//   node tools/bot-sim.js easy,medium,hard 5 7       # a three-way match on map seed 7
//   node tools/bot-sim.js hard,hard,easy,easy 5 3 large 1   # a Large map with teams on
//
// With teams on, bots still start on their own colors (as they do when added in the lobby). The
// same seed gives the same map and the same match, so change a profile, rebuild the server
// (cd server && npm run build) and run the same seeds again to compare.

const { dist } = require('./lib');

let clock = 1e12;
Date.now = () => clock; // the systems read the time from here

const { GameState, Tile } = dist('state/GameState.js');
const { BotSystem } = dist('systems/BotSystem.js');
const { CharacterSystem } = dist('systems/CharacterSystem.js');
const { MovementSystem } = dist('systems/MovementSystem.js');
const { CollisionSystem } = dist('systems/CollisionSystem.js');
const { PickupSystem } = dist('systems/PickupSystem.js');
const { RespawnSystem } = dist('systems/RespawnSystem.js');
const { CombatSystem } = dist('systems/CombatSystem.js');
const { TowerSystem } = dist('systems/TowerSystem.js');
const { PhaseSystem } = dist('systems/PhaseSystem.js');
const { ScoreSystem } = dist('systems/ScoreSystem.js');
const { generateTerrain, seededRandom } = dist('terrain.js');
const { generatePickups } = dist('pickups.js');
const { TICK_RATE, BACKPACKS_ENABLED, RESPAWN_WHERE_DIED_ENABLED } = dist('constants.js');
const { MAP_SIZES } = dist('types/shared.js');

const difficulties = (process.argv[2] || 'easy,medium,hard').split(',');
const minutes = Number(process.argv[3] || 5);
const seed = Number(process.argv[4] || 1);
const size = MAP_SIZES[process.argv[5] || 'small'];
const teams = process.argv[6] === '1';
const random = seededRandom(seed);
Math.random = seededRandom(seed + 1); // anything that doesn't take `random` (pod rolls, ...)

// A room as GameRoom.onCreate makes it, with the bots added in the lobby.
const state = new GameState();
state.settings.matchMinutes = minutes;
state.settings.teams = teams;
// The same server flags GameRoom copies into the state.
state.dropBackpacks = BACKPACKS_ENABLED;
state.respawnWhereDied = RESPAWN_WHERE_DIED_ENABLED;
state.mapWidth = size.cols;
state.mapHeight = size.rows;
const { terrain } = generateTerrain(size.cols, size.rows, random);
for (const type of terrain) {
    const tile = new Tile();
    tile.terrain = type;
    state.tiles.push(tile);
}
for (const spot of generatePickups(terrain, size.cols, size.rows, random)) {
    PickupSystem.addPod(state, spot);
}
for (const difficulty of difficulties) {
    if (!BotSystem.add(state, difficulty, random)) throw new Error(`can't add a "${difficulty}" bot`);
}

// Start the match as LobbySystem does, then tick it as GameRoom does until it ends.
state.players.forEach((player) => CharacterSystem.apply(player));
PhaseSystem.transitionTo(state, 'playing');
const inputs = new Map();
const quiet = () => {};
const dt = 1 / TICK_RATE;
const bots = Array.from(state.players.values());
let ticks = 0;
let busiest = 0;
let total = 0;
while (state.phase.phase === 'playing') {
    clock += 1000 / TICK_RATE;
    const start = process.hrtime.bigint();
    BotSystem.update(state, inputs, random, clock);
    MovementSystem.update(state, inputs, dt);
    CollisionSystem.update(state, quiet);
    PickupSystem.update(state, quiet, random, clock);
    RespawnSystem.update(state, quiet, clock);
    TowerSystem.update(state, clock);
    CombatSystem.update(state, dt, quiet);
    PhaseSystem.update(state, quiet);
    ScoreSystem.update(state);
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    busiest = Math.max(busiest, ms);
    total += ms;
    ticks++;
    if (ticks % (60 * TICK_RATE) === 0) {
        const scores = bots.map((b) => `${b.name} (${b.botDifficulty}) ${b.score}`).join(', ');
        console.log(`${ticks / TICK_RATE / 60} min: ${scores}`);
    }
}

const structuresOf = (id) =>
    Array.from(state.structures.values()).filter((s) => s.ownerId === id).length;
console.table(
    bots
        .sort((a, b) => b.score - a.score)
        .map((b) => ({
            name: b.name,
            difficulty: b.botDifficulty,
            character: b.character,
            score: b.score,
            hexes: b.tilesOwned,
            kills: b.kills,
            structures: structuresOf(b.id),
            materials: b.materials,
            gun: b.gun || '-',
            ammo: b.ammo,
            upgrades: `B${b.boosterLevel} E${b.expanderLevel} A${b.armorLevel} W${b.wingsLevel}`,
        }))
);
console.log(
    `${ticks} ticks: ${(total / ticks).toFixed(2)} ms a tick on average, ${busiest.toFixed(1)} ms at most (the budget is ${1000 / TICK_RATE} ms)`
);
