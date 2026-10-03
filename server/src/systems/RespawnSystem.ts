import { Backpack, type GameState, type Player } from '../state/GameState';
import { RESPAWN_DELAY_MS } from '../constants';
import { hexIndex, hexNeighbors, isValidHex, pixelToHex, type HexCoord } from '../hex';
import { blocksWalkingAt, spawnPoint } from '../terrain';
import { areAllies } from '../teams';
import {
    GUN_NAMES,
    UPGRADE_IDS,
    inStructure,
    isGunId,
    upgradeLabel,
    upgradeLevel,
    type BackpackCollectedEvent,
} from '../types/shared';
import { UpgradeSystem } from './UpgradeSystem';

/**
 * Defeat, the respawn delay, and backpacks. See docs/GAME_DESIGN.md → Players.
 *
 * A defeated player drops their weapons and upgrades (gun, ammo and every upgrade level; not their
 * structures or materials) in a backpack on the hex where they fell, then is out of the match for
 * RESPAWN_DELAY_MS: not drawn, can't move, act or be hit. Then they respawn at their spawn spot with
 * full health. Only the owner sees their backpacks (GameRoom puts each in its owner's StateView) and
 * only the owner can take one back, by walking onto its hex.
 */

/** Sends one player a private message (their client, if they have one; bots have none). */
export type Notify = (playerId: string, type: string, payload: unknown) => void;

/** Whether the player is in play (not waiting to respawn). */
function isAlive(player: { respawnAt: number }): boolean {
    return player.respawnAt === 0;
}

function carriesGear(player: Player): boolean {
    return (
        player.gun !== '' ||
        player.ammo > 0 ||
        UPGRADE_IDS.some((id) => upgradeLevel(player, id) > 0)
    );
}

/**
 * Where a backpack dropped at (x, y) goes: that hex if the owner can walk to it, else the nearest
 * one they can (they may have fallen flying over a mountain or deep water, and their Jetpack is in
 * the backpack). Never inside an enemy's structure.
 */
function dropHex(state: GameState, player: Player): HexCoord {
    const { mapWidth: cols, mapHeight: rows } = state;
    const under = pixelToHex(player.x, player.y);
    const start = {
        col: Math.max(0, Math.min(cols - 1, under.col)),
        row: Math.max(0, Math.min(rows - 1, under.row)),
    };
    const enemyStructures = Array.from(state.structures.values()).filter(
        (s) => !areAllies(state, s.ownerId, player.id)
    );
    const usable = (h: HexCoord) =>
        !blocksWalkingAt(state, h.col, h.row) &&
        !enemyStructures.some((s) => inStructure(h.col, h.row, s));
    const seen = new Set([hexIndex(start.col, start.row, cols)]);
    const queue = [start];
    for (let q = 0; q < queue.length; q++) {
        if (usable(queue[q])) return queue[q];
        for (const n of hexNeighbors(queue[q].col, queue[q].row)) {
            const i = hexIndex(n.col, n.row, cols);
            if (!isValidHex(n.col, n.row, cols, rows) || seen.has(i)) continue;
            seen.add(i);
            queue.push(n);
        }
    }
    return start;
}

/**
 * `player` has been defeated: their gun, ammo and upgrades go into a backpack where they fell
 * (none if they had nothing), and they're out until `now + RESPAWN_DELAY_MS`. Kills are the
 * caller's business (CombatSystem). Returns the backpack, if any.
 */
function defeat(state: GameState, player: Player, now = Date.now()): Backpack | null {
    let pack: Backpack | null = null;
    if (carriesGear(player)) {
        const hex = dropHex(state, player);
        pack = new Backpack();
        pack.id = `pack-${state.backpacksMade++}`;
        pack.ownerId = player.id;
        pack.tileX = hex.col;
        pack.tileY = hex.row;
        pack.gun = player.gun;
        pack.ammo = player.ammo;
        for (const id of UPGRADE_IDS) pack[`${id}Level`] = upgradeLevel(player, id);
        pack.equippedUpgrade = player.equippedUpgrade;
        state.backpacks.set(pack.id, pack);
    }

    player.gun = '';
    player.ammo = 0;
    for (const id of UPGRADE_IDS) player[`${id}Level`] = 0;
    player.equippedUpgrade = '';
    UpgradeSystem.applyUpgradeEffects(player);
    player.health = 0;
    player.vx = 0;
    player.vy = 0;
    player.respawnAt = now + RESPAWN_DELAY_MS;
    return pack;
}

/** Back in play at their spawn spot, with full health. */
function respawn(state: GameState, player: Player): void {
    const start = spawnPoint(state, player.spawnSlot);
    player.x = start.x;
    player.y = start.y;
    player.vx = 0;
    player.vy = 0;
    player.health = player.maxHealth;
    player.respawnAt = 0;
}

const GUN_RANK = { '': 0, basic: 1, big: 2 } as const;

/**
 * Gives `player` back what's in `pack`, keeping whatever is better of theirs: the better gun, every
 * upgrade at the higher level, and the ammo added. The equipped upgrade comes back only if their
 * slot is empty. Extra max health from Armor is added to their health, as when fabricating it.
 */
function restore(player: Player, pack: Backpack): void {
    const theirs = isGunId(player.gun) ? GUN_RANK[player.gun] : 0;
    const packed = isGunId(pack.gun) ? GUN_RANK[pack.gun] : 0;
    if (packed > theirs) player.gun = pack.gun;
    player.ammo += pack.ammo;
    for (const id of UPGRADE_IDS) {
        player[`${id}Level`] = Math.max(upgradeLevel(player, id), pack[`${id}Level`]);
    }
    if (player.equippedUpgrade === '') player.equippedUpgrade = pack.equippedUpgrade;
    const before = player.maxHealth;
    UpgradeSystem.applyUpgradeEffects(player);
    player.health += player.maxHealth - before;
}

/** "Ion Cannon, 12 ammo, Booster 2" */
function contentsLabel(pack: Backpack): string {
    const parts: string[] = [];
    if (isGunId(pack.gun)) parts.push(GUN_NAMES[pack.gun]);
    if (pack.ammo > 0) parts.push(`${pack.ammo} ammo`);
    for (const id of UPGRADE_IDS) {
        const level = pack[`${id}Level`];
        if (level > 0) parts.push(upgradeLabel(id, level));
    }
    return parts.join(', ');
}

/**
 * Every tick: respawns anyone whose delay is over, then (during the match) a player in play standing
 * on the hex of one of their own backpacks takes it back, and is told what was in it (privately:
 * `backpackCollected`). Nobody else can take it. `now` is for tests.
 */
function update(state: GameState, notify: Notify, now = Date.now()): void {
    state.players.forEach((player) => {
        if (!isAlive(player) && now >= player.respawnAt) respawn(state, player);
    });
    if (state.phase.phase !== 'playing' || state.backpacks.size === 0) return;

    state.players.forEach((player) => {
        if (!player.connected || !isAlive(player)) return;
        const { col, row } = pixelToHex(player.x, player.y);
        state.backpacks.forEach((pack, id) => {
            if (pack.ownerId !== player.id || pack.tileX !== col || pack.tileY !== row) return;
            restore(player, pack);
            state.backpacks.delete(id);
            notify(player.id, 'backpackCollected', {
                contents: contentsLabel(pack),
            } satisfies BackpackCollectedEvent);
        });
    });
}

/** Removes a player's backpacks (they've left the game for good). */
function removeBackpacksOf(state: GameState, playerId: string): void {
    state.backpacks.forEach((pack, id) => {
        if (pack.ownerId === playerId) state.backpacks.delete(id);
    });
}

export const RespawnSystem = { isAlive, defeat, update, removeBackpacksOf };
