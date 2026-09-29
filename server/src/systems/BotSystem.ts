import { Player, type GameState } from '../state/GameState';
import {
    BOT_NAMES,
    BOT_PROFILES,
    BOT_SPAWN_MERCY_RADIUS,
    HEX_SIZE,
    SCREEN_Y_SCALE,
    SPAWN_SLOTS,
    type BotProfile,
} from '../constants';
import {
    CHARACTER_IDS,
    DEFAULT_BOT_DIFFICULTY,
    SHOP_ITEMS,
    isBotDifficulty,
    isCharacterId,
    type UpdateBotMessage,
    type UpgradeId,
} from '../types/shared';
import { hexCenter, hexDistance, hexIndex, type HexCoord } from '../hex';
import { assignSpawn } from '../terrain';
import { areAllies } from '../teams';
import { newBrain, type BotBrain } from '../bots/brain';
import { findBuildSite, hexOf, planClaimRoute, planRouteToward } from '../bots/navigation';
import { aimAngle, aimWobble, hasLineOfSight, screenDistance } from '../bots/aim';
import { nextPurchase } from '../bots/shopping';
import { LobbySystem } from './LobbySystem';
import { CombatSystem } from './CombatSystem';
import { ShopSystem } from './ShopSystem';
import { StructureSystem } from './StructureSystem';
import { UpgradeSystem } from './UpgradeSystem';
import type { PlayerInput } from './MovementSystem';

/**
 * Bots: computer-controlled players for single-player games (or to fill out a multiplayer one).
 * A bot is an ordinary Player with `bot` set and no client. In the lobby anyone can add, change or
 * remove one; it's always ready. During the match `update` plays each bot through the same doors a
 * person's client uses: it writes the bot's movement input for MovementSystem, and fires, places
 * structures, fabricates and switches upgrades through CombatSystem, StructureSystem, ShopSystem
 * and UpgradeSystem, so bots follow every rule people do. How well it plays is its difficulty's
 * profile (BOT_PROFILES in constants.ts). See docs/GAME_DESIGN.md → Bots.
 *
 * Each bot, every tick:
 *  - thinks (every profile.thinkMs): picks a goal — chase a nearby enemy (armed), claim the hexes a
 *    structure spot needs (holding a structure), or go claim the best-looking ground in reach — and
 *    plans a route of hexes to it around terrain and enemy structures (bots/navigation.ts);
 *  - steers along that route (or circles its prey), and wriggles free if it stops making progress;
 *  - shoots the nearest enemy (or, failing that, enemy structure) in range and in sight, once it
 *    has been in its sights for profile.reactionMs, leading and missing by its profile;
 *  - fabricates from its shopping list (every profile.shopMs; bots/shopping.ts).
 */

// --- In the lobby --------------------------------------------------------------------------------

/** "Bot Cassini": the first BOT_NAMES entry nobody has, made unique like any name. */
function botName(state: GameState): string {
    const taken = new Set(Array.from(state.players.values(), (p) => p.name.toLowerCase()));
    const free = BOT_NAMES.find((name) => !taken.has(`bot ${name}`.toLowerCase()));
    return LobbySystem.uniqueName(state, free ? `Bot ${free}` : 'Bot');
}

/**
 * Adds a bot of `difficulty` (lobby phase only, while there's a free spawn slot): a free color, a
 * random character, a spawn slot, ready. Returns it, or null if refused.
 */
function add(state: GameState, difficulty: unknown, random = Math.random): Player | null {
    if (state.phase.phase !== 'lobby' || !isBotDifficulty(difficulty)) return null;
    if (state.players.size >= SPAWN_SLOTS) return null;

    const bot = new Player();
    bot.id = `bot-${state.botsMade++}`;
    bot.bot = true;
    bot.botDifficulty = difficulty;
    bot.name = botName(state);
    LobbySystem.setTeam(bot, LobbySystem.defaultTeam(state));
    bot.character = CHARACTER_IDS[Math.floor(random() * CHARACTER_IDS.length)];
    bot.ready = true;
    assignSpawn(state, bot);
    state.players.set(bot.id, bot);
    state.botBrains.set(bot.id, newBrain());
    return bot;
}

function lobbyBot(state: GameState, botId: unknown): Player | undefined {
    if (state.phase.phase !== 'lobby' || typeof botId !== 'string') return undefined;
    const bot = state.players.get(botId);
    return bot?.bot ? bot : undefined;
}

/** Removes a bot (lobby phase only). Returns whether it did. */
function remove(state: GameState, botId: unknown): boolean {
    const bot = lobbyBot(state, botId);
    if (!bot) return false;
    state.players.delete(bot.id);
    state.botBrains.delete(bot.id);
    return true;
}

/**
 * Changes a bot's difficulty, team (color) or character (lobby phase only). Each field is applied
 * if it's valid (a team by the same rule as a person's pick); the rest are left alone. Returns
 * whether anything was accepted.
 */
function configure(state: GameState, message: Partial<UpdateBotMessage> | undefined): boolean {
    const bot = lobbyBot(state, message?.botId);
    if (!bot || !message) return false;
    let changed = false;
    if (isBotDifficulty(message.difficulty)) {
        bot.botDifficulty = message.difficulty;
        changed = true;
    }
    if (message.teamId !== undefined && LobbySystem.canTakeTeam(state, bot, message.teamId)) {
        LobbySystem.setTeam(bot, message.teamId);
        changed = true;
    }
    if (isCharacterId(message.characterId)) {
        bot.character = message.characterId;
        changed = true;
    }
    return changed;
}

function botCount(state: GameState): number {
    let count = 0;
    state.players.forEach((player) => {
        if (player.bot) count++;
    });
    return count;
}

// --- In the match --------------------------------------------------------------------------------

const WAYPOINT_REACHED = HEX_SIZE / 2; // world px from a hex's center counts as there
const REPLAN_MS = 2000; // a claiming route is re-planned at least this often
const RESPAWN_JUMP = 150; // world px moved in one tick: it was defeated and respawned
const STUCK_WINDOW_MS = 700; // trying to move this long ...
const STUCK_DISTANCE = 8; // ... while getting less than this far (world px) means it's stuck
const UNSTICK_MS = 450; // then it walks a random way this long
const STRAFE_FLIP_MS = 1500; // about how often a strafing bot changes direction
const FACE_SHOT_MS = 400; // after a shot it keeps facing where it fired this long
const CHASE_EXTRA_DEPTH = 8; // route search reaches this much further when chasing
const BUILD_RADIUS = 5; // hexes: how far it looks for a structure spot to work toward
const CASUAL_BUILD_RADIUS = 3; // without buildSites: only spots it already owns, this close
const BUILD_GIVE_UP_MS = 10_000; // working toward one spot longer than this, it gives up ...
const BUILD_RETRY_MS = 8_000; // ... and doesn't try again for this long

const STOP = { x: 0, y: 0 };

function profileOf(bot: Player): BotProfile {
    return BOT_PROFILES[
        isBotDifficulty(bot.botDifficulty) ? bot.botDifficulty : DEFAULT_BOT_DIFFICULTY
    ];
}

/** Stick input that walks from `from` toward world point (x, y) at `speed` (0..1) of top speed on screen. */
function toward(from: { x: number; y: number }, x: number, y: number, speed: number) {
    const dx = x - from.x;
    const dy = y - from.y;
    const length = Math.hypot(dx, dy * SCREEN_Y_SCALE);
    return length < 1e-6 ? STOP : { x: (dx / length) * speed, y: (dy / length) * speed };
}

/**
 * Whether a bot may go after `other`: a connected enemy who isn't in their own spawn area (bots
 * don't camp spawn points; BOT_SPAWN_MERCY_RADIUS).
 */
function isFairGame(state: GameState, bot: Player, other: Player): boolean {
    if (other === bot || !other.connected || areAllies(state, bot.id, other.id)) return false;
    const spawn = { col: other.spawnTileX, row: other.spawnTileY };
    return hexDistance(hexOf(state, other.x, other.y), spawn) > BOT_SPAWN_MERCY_RADIUS;
}

/** The nearest enemy it may go after within `range` (on-screen px), or null. */
function nearestEnemy(state: GameState, bot: Player, range: number): Player | null {
    let best: Player | null = null;
    let bestDistance = range;
    state.players.forEach((other) => {
        if (!isFairGame(state, bot, other)) return;
        const distance = screenDistance(bot, other);
        if (distance <= bestDistance) {
            best = other;
            bestDistance = distance;
        }
    });
    return best;
}

/** Keeps the right upgrade in the slot for what it's doing (see BotProfile.equip). */
function equipFor(state: GameState, bot: Player, profile: BotProfile, chasing: boolean): void {
    if (profile.equip === 'never') return;
    let want: UpgradeId | '' = '';
    if (profile.equip === 'smart' && chasing && bot.boosterLevel > 0) want = 'booster';
    else if (bot.expanderLevel > 0) want = 'expander';
    else if (bot.boosterLevel > 0) want = 'booster';
    if (want !== '' && want !== bot.equippedUpgrade) UpgradeSystem.equip(state, bot, want);
}

/**
 * Holding a structure: places it if there's a spot it already owns all 7 hexes of, else (with
 * profile.buildSites) sets a route to claim the next hex the best nearby spot needs. Returns
 * whether building is now its goal.
 */
function planBuild(
    state: GameState,
    bot: Player,
    brain: BotBrain,
    profile: BotProfile,
    now: number
): boolean {
    if (now < brain.nextBuildAt) return false;
    const site = findBuildSite(state, bot, profile.buildSites ? BUILD_RADIUS : CASUAL_BUILD_RADIUS);
    if (site && site.missing.length === 0) {
        StructureSystem.place(
            state,
            bot,
            bot.structureInventory[0],
            site.center.col,
            site.center.row
        );
        brain.goal = 'claim';
        brain.route = [];
        return false;
    }
    if (!site || !profile.buildSites) return false;

    if (brain.goal !== 'build') brain.buildUntil = now + BUILD_GIVE_UP_MS;
    else if (now >= brain.buildUntil) {
        brain.nextBuildAt = now + BUILD_RETRY_MS;
        return false;
    }
    const here = hexOf(state, bot.x, bot.y);
    let next: HexCoord = site.missing[0];
    for (const hex of site.missing) {
        if (hexDistance(here, hex) < hexDistance(here, next)) next = hex;
    }
    brain.goal = 'build';
    brain.route = planRouteToward(state, bot, next, BUILD_RADIUS + 4);
    return true;
}

/** Whether the claiming route's last hex is still worth going to (not ours yet, or a pod is there). */
function goalStillWorthIt(state: GameState, bot: Player, route: HexCoord[]): boolean {
    const goal = route[route.length - 1];
    if (!goal) return false;
    const tile = state.tiles[hexIndex(goal.col, goal.row, state.mapWidth)];
    if (tile?.ownerId !== bot.id) return true;
    return Array.from(state.pickups.values()).some(
        (p) => p.tileX === goal.col && p.tileY === goal.row
    );
}

function think(
    state: GameState,
    bot: Player,
    brain: BotBrain,
    profile: BotProfile,
    now: number,
    random: () => number
): void {
    if (now < brain.nextThinkAt || now < brain.idleUntil) return;
    brain.nextThinkAt = now + profile.thinkMs * (0.75 + 0.5 * random());
    if (profile.idleChance > 0 && random() < profile.idleChance) {
        brain.idleUntil = now + profile.idleMs;
        brain.route = [];
        return;
    }

    const armed = bot.gun !== '' && bot.ammo > 0;
    const healthy = bot.health >= profile.retreatHealth * bot.maxHealth;
    const prey =
        armed && healthy && profile.chaseRange > 0
            ? nearestEnemy(state, bot, profile.chaseRange)
            : null;
    brain.chaseId = prey?.id ?? '';
    equipFor(state, bot, profile, prey !== null);

    if (prey) {
        brain.goal = 'chase';
        const depth = profile.searchDepth + CHASE_EXTRA_DEPTH;
        brain.route = planRouteToward(state, bot, hexOf(state, prey.x, prey.y), depth);
        return;
    }
    if (bot.structureInventory.length > 0 && planBuild(state, bot, brain, profile, now)) return;

    if (
        brain.goal !== 'claim' ||
        now >= brain.replanAt ||
        !goalStillWorthIt(state, bot, brain.route)
    ) {
        brain.goal = 'claim';
        brain.route = planClaimRoute(state, bot, {
            depth: profile.searchDepth,
            noise: profile.goalNoise,
            random,
        });
        brain.replanAt = now + REPLAN_MS;
    }
}

/** This tick's stick input: dawdling, wriggling free, circling its prey, or following its route. */
function steer(
    state: GameState,
    bot: Player,
    brain: BotBrain,
    profile: BotProfile,
    now: number,
    random: () => number
): { x: number; y: number } {
    if (now < brain.idleUntil) return STOP;
    if (now < brain.unstickUntil) {
        const angle = brain.unstickAngle;
        return toward(bot, bot.x + Math.cos(angle), bot.y + Math.sin(angle) / SCREEN_Y_SCALE, 1);
    }

    const prey = brain.goal === 'chase' ? state.players.get(brain.chaseId) : undefined;
    if (
        prey?.connected &&
        screenDistance(bot, prey) <= profile.keepDistance &&
        hasLineOfSight(state, bot, prey)
    ) {
        if (!profile.strafe) return STOP;
        if (now >= brain.strafeFlipAt) {
            brain.strafeSign = random() < 0.5 ? -1 : 1;
            brain.strafeFlipAt = now + STRAFE_FLIP_MS * (0.5 + random());
        }
        // Sideways to the line between them, on screen.
        const sx = (prey.x - bot.x) * brain.strafeSign;
        const sy = (prey.y - bot.y) * SCREEN_Y_SCALE * brain.strafeSign;
        return toward(bot, bot.x - sy, bot.y + sx / SCREEN_Y_SCALE, profile.speed);
    }

    // Waypoints are reached at their center (which keeps it clear of terrain corners on the way),
    // except that a hex it's going to claim only has to be stood on.
    const hadRoute = brain.route.length > 0;
    const here = hexOf(state, bot.x, bot.y);
    while (brain.route.length > 0) {
        const next = brain.route[0];
        const c = hexCenter(next.col, next.row);
        const arrived =
            Math.hypot(c.x - bot.x, c.y - bot.y) <= WAYPOINT_REACHED ||
            (brain.route.length === 1 &&
                brain.goal !== 'chase' &&
                next.col === here.col &&
                next.row === here.row);
        if (!arrived) break;
        brain.route.shift();
    }
    if (brain.route.length === 0) {
        if (hadRoute) brain.nextThinkAt = now; // arrived: decide what's next straight away
        return STOP;
    }
    const next = hexCenter(brain.route[0].col, brain.route[0].row);
    return toward(bot, next.x, next.y, profile.speed);
}

/** Notices a bot that keeps pushing but isn't getting anywhere, and sends it a random way for a moment. */
function checkStuck(
    bot: Player,
    brain: BotBrain,
    dir: { x: number; y: number },
    now: number,
    random: () => number
): void {
    const moving = dir.x !== 0 || dir.y !== 0;
    if (moving && now - brain.progressAt < STUCK_WINDOW_MS) return;
    const moved = Math.hypot(bot.x - brain.progressX, bot.y - brain.progressY);
    if (moving && moved < STUCK_DISTANCE && now >= brain.unstickUntil) {
        brain.unstickUntil = now + UNSTICK_MS;
        brain.unstickAngle = random() * Math.PI * 2;
        brain.route = [];
        brain.nextThinkAt = now + UNSTICK_MS;
    }
    brain.progressX = bot.x;
    brain.progressY = bot.y;
    brain.progressAt = now;
}

interface Target {
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
}

/**
 * What to shoot at: the nearest enemy player in range and in sight (and not in their own spawn area); failing that (with
 * profile.shootStructures, and ammo to spare) the nearest enemy structure in range and in sight.
 */
function pickTarget(state: GameState, bot: Player, profile: BotProfile): Target | null {
    const enemies = Array.from(state.players.values())
        .filter((p) => isFairGame(state, bot, p))
        .map((p) => ({ p, distance: screenDistance(bot, p) }))
        .filter(({ distance }) => distance <= profile.range)
        .sort((a, b) => a.distance - b.distance);
    for (const { p } of enemies) {
        if (hasLineOfSight(state, bot, p)) return { id: p.id, x: p.x, y: p.y, vx: p.vx, vy: p.vy };
    }

    if (!profile.shootStructures || bot.ammo <= profile.ammoLow / 2) return null;
    let best: Target | null = null;
    let bestDistance = profile.range;
    state.structures.forEach((structure) => {
        if (areAllies(state, bot.id, structure.ownerId)) return;
        const c = hexCenter(structure.tileX, structure.tileY);
        const distance = screenDistance(bot, c);
        if (distance <= bestDistance && hasLineOfSight(state, bot, c)) {
            best = { id: structure.id, x: c.x, y: c.y, vx: 0, vy: 0 };
            bestDistance = distance;
        }
    });
    return best;
}

/** Fires at its target if it has had it in its sights long enough and its gun is ready. */
function shoot(
    state: GameState,
    bot: Player,
    brain: BotBrain,
    profile: BotProfile,
    now: number,
    random: () => number
): boolean {
    if (bot.gun === '' || bot.ammo <= 0) {
        brain.targetId = '';
        return false;
    }
    const target = pickTarget(state, bot, profile);
    if (!target) {
        brain.targetId = '';
        return false;
    }
    if (target.id !== brain.targetId) {
        brain.targetId = target.id;
        brain.sightedAt = now;
    }
    if (now - brain.sightedAt < profile.reactionMs) return false;
    if (now - brain.lastShotAt < profile.fireIntervalMs) return false;

    const angle = aimAngle(bot, target, profile.lead) + aimWobble(profile.aimError, random);
    if (!CombatSystem.fire(state, bot, angle)) return false;
    brain.lastShotAt = now;
    bot.angle = angle;
    return true;
}

/** Fabricates the next thing on its list, if it's time to look and it can afford it. */
function fabricate(bot: Player, brain: BotBrain, profile: BotProfile, now: number): void {
    if (now < brain.nextShopAt) return;
    brain.nextShopAt = now + profile.shopMs;
    const item = nextPurchase(bot, profile, brain.structuresBought);
    if (item && ShopSystem.purchase(bot, item) && SHOP_ITEMS[item].structure) {
        brain.structuresBought++;
    }
}

/**
 * Plays every bot for one tick (playing phase only): sets its movement input in `inputs` (which
 * MovementSystem reads next) and takes its actions. `random` and `now` are for tests.
 */
function update(
    state: GameState,
    inputs: Map<string, PlayerInput>,
    random: () => number = Math.random,
    now: number = Date.now()
): void {
    if (state.phase.phase !== 'playing') return;

    state.botBrains.forEach((brain, id) => {
        const bot = state.players.get(id);
        if (!bot) {
            state.botBrains.delete(id);
            return;
        }
        const profile = profileOf(bot);

        // Defeated and respawned: whatever it was doing, it's somewhere else now.
        if (Math.hypot(bot.x - brain.lastX, bot.y - brain.lastY) > RESPAWN_JUMP) {
            brain.route = [];
            brain.nextThinkAt = now;
            brain.progressAt = now;
            brain.progressX = bot.x;
            brain.progressY = bot.y;
        }

        think(state, bot, brain, profile, now, random);
        let dir = steer(state, bot, brain, profile, now, random);
        if (brain.nextThinkAt <= now) {
            // It just arrived: pick the next goal now rather than standing still for a tick.
            think(state, bot, brain, profile, now, random);
            dir = steer(state, bot, brain, profile, now, random);
        }
        checkStuck(bot, brain, dir, now, random);
        inputs.set(id, { dir, seq: 0, receivedAt: now });

        const fired = shoot(state, bot, brain, profile, now, random);
        if (!fired && now - brain.lastShotAt > FACE_SHOT_MS && (dir.x !== 0 || dir.y !== 0)) {
            bot.angle = Math.atan2(dir.y, dir.x);
        }
        fabricate(bot, brain, profile, now);

        brain.lastX = bot.x;
        brain.lastY = bot.y;
    });
}

export const BotSystem = { add, remove, configure, botCount, update };
