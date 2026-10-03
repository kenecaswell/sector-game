import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOT_PROFILES, BOT_START_DELAY_MS, RESPAWN_DELAY_MS, SPAWN_SLOTS } from '../constants';
import { hexCenter, hexNeighbors } from '../hex';
import { GameState, type Player } from '../state/GameState';
import { DT, addPlayerAt, addStructure, ownFootprint, setTerrain, world } from '../test/world';
import { seededRandom } from '../terrain';
import { SHOP_ITEMS, TERRAIN, type BotDifficulty } from '../types/shared';
import { BotSystem } from './BotSystem';
import { CharacterSystem } from './CharacterSystem';
import { CollisionSystem } from './CollisionSystem';
import { CombatSystem } from './CombatSystem';
import { LobbySystem } from './LobbySystem';
import { MovementSystem, type PlayerInput } from './MovementSystem';
import { PhaseSystem } from './PhaseSystem';
import { RespawnSystem } from './RespawnSystem';
import { StructureSystem } from './StructureSystem';

const quiet = () => {};

/** A bot added in the lobby, then the match started (kit applied), standing on hex (col, row). */
function botInMatch(
    state: GameState,
    difficulty: BotDifficulty,
    col: number,
    row: number,
    kit: Partial<Player> = {}
): Player {
    const phase = state.phase.phase;
    state.phase.phase = 'lobby';
    const bot = BotSystem.add(state, difficulty, () => 0)!; // () => 0: the Farmer
    state.phase.phase = phase;
    CharacterSystem.apply(bot);
    const c = hexCenter(col, row);
    Object.assign(bot, { x: c.x, y: c.y, ...kit });
    return bot;
}

/** Runs the match for `seconds` on the fake clock: bots think and act, everyone moves and claims. */
function play(state: GameState, seconds: number, random = seededRandom(7)): void {
    const inputs = new Map<string, PlayerInput>();
    for (let i = 0; i < seconds / DT; i++) {
        vi.advanceTimersByTime(DT * 1000);
        BotSystem.update(state, inputs, random, Date.now());
        MovementSystem.update(state, inputs, DT);
        CollisionSystem.update(state, quiet);
        CombatSystem.update(state, DT, quiet);
    }
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
});
afterEach(() => {
    vi.useRealTimers();
});

describe('BotSystem — in the lobby', () => {
    it('adds a ready bot with its difficulty, its own color, a name and a spawn slot', () => {
        const state = world('lobby', { teams: false });
        const person = addPlayerAt(state, 'me', 60, 32, 'red');
        const bot = BotSystem.add(state, 'hard')!;
        expect(bot).toMatchObject({
            bot: true,
            botDifficulty: 'hard',
            ready: true,
            name: 'Bot Cassini',
        });
        expect(bot.teamId).not.toBe(person.teamId);
        expect(bot.spawnSlot).not.toBe(person.spawnSlot);
        expect(state.botBrains.has(bot.id)).toBe(true);
        expect(BotSystem.add(state, 'easy')!.name).toBe('Bot Huygens');
        expect(BotSystem.botCount(state)).toBe(2);
    });

    it('refuses a bad difficulty, a full room, and anything once the countdown starts', () => {
        const state = world('lobby');
        expect(BotSystem.add(state, 'impossible')).toBeNull();
        for (let i = 0; i < SPAWN_SLOTS; i++) expect(BotSystem.add(state, 'easy')).not.toBeNull();
        expect(BotSystem.add(state, 'easy')).toBeNull();
        state.players.clear();
        state.phase.phase = 'countdown';
        expect(BotSystem.add(state, 'easy')).toBeNull();
    });

    it('changes and removes bots (lobby only), and never a person', () => {
        const state = world('lobby', { teams: false });
        const person = addPlayerAt(state, 'me', 60, 32, 'red');
        const bot = BotSystem.add(state, 'easy')!;
        expect(
            BotSystem.configure(state, { botId: bot.id, difficulty: 'hard', characterId: 'robot' })
        ).toBe(true);
        expect(bot).toMatchObject({ botDifficulty: 'hard', character: 'robot' });
        // Teams off: a color someone else has is taken, a free one isn't.
        expect(BotSystem.configure(state, { botId: bot.id, teamId: 'red' })).toBe(false);
        expect(BotSystem.configure(state, { botId: bot.id, teamId: 'teal' })).toBe(true);
        expect(bot.color).toBe('#1abc9c');
        expect(BotSystem.configure(state, { botId: 'me', difficulty: 'hard' })).toBe(false);
        expect(BotSystem.remove(state, 'me')).toBe(false);
        state.phase.phase = 'playing';
        expect(BotSystem.remove(state, bot.id)).toBe(false);
        state.phase.phase = 'lobby';
        expect(BotSystem.remove(state, bot.id)).toBe(true);
        expect(state.players.has(bot.id) || state.botBrains.has(bot.id)).toBe(false);
        expect(state.players.get('me')).toBe(person);
    });

    it("bots alone don't start a match, but one ready person with bots does", () => {
        const state = new GameState();
        BotSystem.add(state, 'easy');
        BotSystem.add(state, 'hard');
        expect(LobbySystem.everyoneReady(state)).toBe(false);
        const person = addPlayerAt(state, 'me', 60, 32);
        expect(LobbySystem.everyoneReady(state)).toBe(false);
        person.ready = true;
        expect(LobbySystem.everyoneReady(state)).toBe(true);
    });
});

describe('BotSystem — playing', () => {
    it('does nothing outside the match', () => {
        const state = world('lobby');
        BotSystem.add(state, 'hard');
        const inputs = new Map<string, PlayerInput>();
        BotSystem.update(state, inputs);
        expect(inputs.size).toBe(0);
    });

    it('claims ground, and a harder bot claims more', () => {
        const claimed = (['easy', 'medium', 'hard'] as const).map((difficulty) => {
            const state = world();
            const bot = botInMatch(state, difficulty, 40, 32);
            play(state, 12);
            return bot.tilesOwned;
        });
        expect(claimed[0]).toBeGreaterThan(15);
        expect(claimed[1]).toBeGreaterThan(claimed[0]);
        expect(claimed[2]).toBeGreaterThan(claimed[1]);
    });

    it('gets around terrain: it keeps claiming inside a ring of mountains with one way out', () => {
        const state = world();
        const bot = botInMatch(state, 'medium', 32, 32);
        // A ring of mountains 4 steps out, open at one hex.
        const ring: Array<[number, number]> = [];
        for (let row = 26; row <= 38; row++) {
            for (let col = 26; col <= 38; col++) {
                const d = Math.max(Math.abs(col - 32), Math.abs(row - 32));
                if (d === 5 && !(col === 37 && row === 32)) ring.push([col, row]);
            }
        }
        setTerrain(state, TERRAIN.mountain, ring);
        play(state, 30);
        const outside = Array.from(state.tiles.entries()).filter(([i, tile]) => {
            const col = i % 64;
            const row = Math.floor(i / 64);
            return tile.ownerId === bot.id && Math.max(Math.abs(col - 32), Math.abs(row - 32)) > 5;
        });
        expect(outside.length).toBeGreaterThan(10);
        expect(bot.tilesOwned).toBeGreaterThan(80);
    });

    it('places a structure it holds as soon as it owns a spot for it', () => {
        const state = world();
        const bot = botInMatch(state, 'easy', 20, 20);
        ownFootprint(state, bot.id, 20, 20);
        bot.structureInventory.clear();
        bot.structureInventory.push('guardTower');
        play(state, 1);
        expect(Array.from(state.structures.values()).map((s) => [s.ownerId, s.type])).toEqual([
            [bot.id, 'guardTower'],
        ]);
        expect(bot.structureInventory.length).toBe(0);
    });

    it('works toward a spot for a structure it holds, then builds it', () => {
        const state = world();
        const bot = botInMatch(state, 'medium', 20, 20); // the Farmer: starts with a farm
        play(state, 15);
        expect(Array.from(state.structures.values()).some((s) => s.ownerId === bot.id)).toBe(true);
    });

    it('fabricates from its list: a Medium bot with a Fabricator makes a gun first', () => {
        const state = world();
        const cost = SHOP_ITEMS.basicGun.cost;
        const bot = botInMatch(state, 'medium', 20, 20, { materials: cost });
        addStructure(state, bot.id, 40, 40, 'fabricator');
        play(state, 0.1);
        expect(bot.gun).toBe('basic');
        expect(bot.materials).toBeLessThan(cost);
    });

    it('with no Fabricator, it buys one before any gear', () => {
        const state = world();
        const bot = botInMatch(state, 'medium', 20, 20, {
            materials: SHOP_ITEMS.basicGun.cost + SHOP_ITEMS.fabricator.cost,
        });
        play(state, 0.1);
        expect(bot.gun).toBe('');
        expect(Array.from(bot.structureInventory)).toContain('fabricator');
    });

    it('builds a Fabricator it holds before the structure it started with', () => {
        const state = world();
        const bot = botInMatch(state, 'hard', 20, 20); // the Farmer: starts with a farm
        bot.structureInventory.push('fabricator');
        ownFootprint(state, bot.id, 20, 20);
        play(state, 1);
        const built = Array.from(state.structures.values()).map((s) => s.type);
        expect(built[0]).toBe('fabricator');
    });

    it('buys a farm when it nears its tile limit', () => {
        const state = world();
        const bot = botInMatch(state, 'hard', 20, 20, { materials: 100 });
        bot.structureInventory.clear();
        addStructure(state, bot.id, 40, 40, 'fabricator');
        bot.tilesOwned = bot.tileCap - 10;
        play(state, 1.1);
        expect(
            Array.from(bot.structureInventory).includes('farm') ||
                Array.from(state.structures.values()).some((s) => s.type === 'farm')
        ).toBe(true);
    });

    it('waits BOT_START_DELAY_MS after the match starts before doing anything', () => {
        const state = world();
        const bot = botInMatch(state, 'hard', 20, 20, { materials: 1000 });
        PhaseSystem.transitionTo(state, 'playing'); // stamps the start time on the fake clock
        const start = { x: bot.x, y: bot.y };
        play(state, BOT_START_DELAY_MS / 1000 - 0.2);
        expect([bot.x, bot.y]).toEqual([start.x, start.y]);
        expect(bot.structureInventory.length).toBeLessThanOrEqual(1); // fabricated nothing either
        play(state, 1.5);
        expect(Math.hypot(bot.x - start.x, bot.y - start.y)).toBeGreaterThan(5);
    });

    describe('shooting', () => {
        /** An armed Hard bot and an enemy person standing 5 hexes east of it, far from their spawn. */
        function duel({ teams = false, enemyTeam = 'blue' } = {}) {
            const state = world('playing', { teams });
            const bot = botInMatch(state, 'hard', 20, 20, { gun: 'basic', ammo: 30 });
            if (teams) bot.teamId = 'red';
            const enemy = addPlayerAt(state, 'foe', 25, 20, enemyTeam);
            enemy.spawnTileX = 60;
            enemy.spawnTileY = 60;
            return { state, bot, enemy };
        }
        const shotsBy = (state: GameState, id: string) =>
            Array.from(state.projectiles.values()).filter((p) => p.ownerId === id).length;

        it('fires at an enemy in sight once its reaction time has passed, and hits', () => {
            const { state, bot, enemy } = duel();
            play(state, (BOT_PROFILES.hard.reactionMs - 60) / 1000);
            expect(bot.ammo).toBe(30); // still reacting
            play(state, 1);
            expect(bot.ammo).toBeLessThan(30);
            expect(enemy.health < enemy.maxHealth || bot.kills > 0).toBe(true);
        });

        it("doesn't fire through a mountain, at a teammate, or at someone in their spawn area", () => {
            // The enemy is walled in by mountains all round: out of sight from anywhere.
            const blocked = duel();
            const ring = hexNeighbors(25, 20).map((h): [number, number] => [h.col, h.row]);
            setTerrain(blocked.state, TERRAIN.mountain, ring);
            play(blocked.state, 1);
            expect(shotsBy(blocked.state, blocked.bot.id)).toBe(0);
            expect(blocked.bot.ammo).toBe(30);

            const mates = duel({ teams: true, enemyTeam: 'red' });
            play(mates.state, 1);
            expect(mates.bot.ammo).toBe(30);

            const home = duel();
            home.enemy.spawnTileX = 25;
            home.enemy.spawnTileY = 20;
            play(home.state, 1);
            expect(home.bot.ammo).toBe(30);
        });

        it('chases an enemy in chase range, stopping at its keep-distance', () => {
            const state = world('playing', { teams: false });
            const bot = botInMatch(state, 'medium', 20, 20, { gun: 'basic', ammo: 30 });
            const enemy = addPlayerAt(state, 'foe', 28, 20, 'blue');
            enemy.spawnTileX = 60;
            enemy.spawnTileY = 60;
            enemy.health = 1e9; // survives, so it stays a target
            enemy.maxHealth = 1e9;
            const before = Math.abs(enemy.x - bot.x);
            play(state, 3);
            const after = Math.abs(enemy.x - bot.x);
            expect(after).toBeLessThan(before - 100);
            expect(after).toBeGreaterThan(BOT_PROFILES.medium.keepDistance - 60);
        });
    });

    it('sits out its respawn delay, then goes back for its backpack and gets its gear back', () => {
        const state = world();
        const bot = botInMatch(state, 'medium', 30, 20, { gun: 'big', ammo: 20 });
        bot.structureInventory.clear();
        RespawnSystem.defeat(state, bot);
        const inputs = new Map<string, PlayerInput>();
        BotSystem.update(state, inputs, seededRandom(1), Date.now());
        expect(inputs.get(bot.id)?.dir).toEqual({ x: 0, y: 0 });

        const run = (seconds: number) => {
            for (let i = 0; i < seconds / DT; i++) {
                vi.advanceTimersByTime(DT * 1000);
                RespawnSystem.update(state, quiet);
                BotSystem.update(state, inputs, seededRandom(i), Date.now());
                MovementSystem.update(state, inputs, DT);
                CollisionSystem.update(state, quiet);
            }
        };
        run(RESPAWN_DELAY_MS / 1000 + 0.1);
        expect(bot.respawnAt).toBe(0); // back at its spawn, near the east edge
        run(15);
        expect(state.backpacks.size).toBe(0);
        expect(bot).toMatchObject({ gun: 'big' });
    });

    it("doesn't shoot at or chase a player who is down", () => {
        const state = world('playing', { teams: false });
        const bot = botInMatch(state, 'hard', 20, 20, { gun: 'basic', ammo: 30 });
        const enemy = addPlayerAt(state, 'foe', 24, 20, 'blue');
        enemy.spawnTileX = 60;
        enemy.spawnTileY = 60;
        enemy.respawnAt = Date.now() + 60_000;
        play(state, 1);
        expect(bot.ammo).toBe(30);
    });

    it('forgets a bot whose player has gone', () => {
        const state = world();
        const bot = botInMatch(state, 'easy', 20, 20);
        state.players.delete(bot.id);
        BotSystem.update(state, new Map());
        expect(state.botBrains.size).toBe(0);
    });

    it('places through the same rules as people (StructureSystem.place)', () => {
        const state = world();
        const bot = botInMatch(state, 'easy', 20, 20);
        expect(StructureSystem.place(state, bot, 'farm', 20, 20)).toBe(false); // owns nothing yet
    });
});
