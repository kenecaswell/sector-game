import { Structure, type GameState, type Player } from '../state/GameState';
import type { Broadcast } from './Broadcast';
import {
    STRUCTURE_SPECS,
    footprintFor,
    inStructure,
    isStructureType,
    maxGuardTowers,
    tileCapFor,
    type StructureDestroyedEvent,
    type StructureType,
} from '../types/shared';
import { hexIndex, isValidHex } from '../hex';

/**
 * Whether `playerId` may build a `type` structure at hex (col, row), turned `rotation` (3-hex
 * structures only): every hex of its footprint (7, or 3 for a Guard Tower) must be on the map (so
 * not at the edge), owned by that player (a teammate's don't count), and not part of another
 * structure.
 */
function canPlace(
    state: GameState,
    playerId: string,
    type: StructureType,
    col: number,
    row: number,
    rotation = 0
): boolean {
    for (const hex of footprintFor(type, col, row, rotation)) {
        // Validate first — an out-of-range column would otherwise wrap onto another row.
        if (!isValidHex(hex.col, hex.row, state.mapWidth, state.mapHeight)) return false;
        if (state.tiles[hexIndex(hex.col, hex.row, state.mapWidth)]?.ownerId !== playerId) {
            return false;
        }
        for (const other of state.structures.values()) {
            if (inStructure(hex.col, hex.row, other)) return false;
        }
    }
    return true;
}

/** How many structures of `type` this player owns. */
function count(state: GameState, playerId: string, type: StructureType): number {
    let total = 0;
    state.structures.forEach((structure) => {
        if (structure.ownerId === playerId && structure.type === type) total++;
    });
    return total;
}

/** Whether this player owns a Fabricator (without one, the Fabricator menu is locked). */
function hasFabricator(state: GameState, playerId: string): boolean {
    return count(state, playerId, 'fabricator') > 0;
}

/**
 * How many Guard Towers this player has: standing ones plus those they hold to place. The limit
 * (`maxGuardTowers` for the game's map size) is on this total.
 */
function towerCount(state: GameState, player: Player): number {
    return (
        count(state, player.id, 'guardTower') +
        player.structureInventory.filter((type) => type === 'guardTower').length
    );
}

/**
 * Whether the player may take on one more structure of `type` (buy it, or find it in a pod): always
 * for every type but the Guard Tower, which is limited per player by map size.
 */
function canHold(state: GameState, player: Player, type: StructureType): boolean {
    return (
        type !== 'guardTower' || towerCount(state, player) < maxGuardTowers(state.settings.mapSize)
    );
}

/**
 * Sets what a player's structures give them: their tile limit (from the farms they own) and
 * whether the Fabricator is open to them (they own one). Called whenever one is placed or
 * destroyed. Losing a farm lowers the limit but never takes hexes away: a player over the new
 * limit keeps what they hold and just can't claim more.
 */
function refreshOwner(state: GameState, playerId: string): void {
    const player = state.players.get(playerId);
    if (!player) return;
    player.tileCap = tileCapFor(count(state, playerId, 'farm'));
    player.hasFabricator = hasFabricator(state, playerId);
    player.towersBuilt = count(state, playerId, 'guardTower');
}

/**
 * `player` places a structure of `type` from their inventory at hex (col, row), if it's the match,
 * they hold one, and `canPlace` allows the spot. One is used up. Returns whether it was placed.
 * People place from GameRoom's `placeStructure` message, bots from BotSystem.
 */
function place(
    state: GameState,
    player: Player,
    type: unknown,
    col: number,
    row: number,
    rotation = 0
): boolean {
    if (state.phase.phase !== 'playing' || !player.connected || !isStructureType(type)) {
        return false;
    }
    if (player.respawnAt > 0) return false; // defeated, waiting to respawn
    const turn = Number.isFinite(rotation) ? Math.trunc(rotation) : 0;
    const slot = player.structureInventory.indexOf(type);
    if (slot === -1 || !canPlace(state, player.id, type, col, row, turn)) return false;

    const spec = STRUCTURE_SPECS[type];
    const structure = new Structure();
    structure.id = `struct-${col}-${row}`;
    structure.ownerId = player.id;
    structure.tileX = col;
    structure.tileY = row;
    structure.type = type;
    // Only a 3-hex structure has more than one way to sit; keep the others at 0.
    structure.rotation = spec.hexes === 3 ? ((turn % 6) + 6) % 6 : 0;
    structure.health = spec.health;
    structure.maxHealth = spec.health;
    player.structureInventory.splice(slot, 1);
    state.structures.set(structure.id, structure);
    refreshOwner(state, player.id);
    return true;
}

/**
 * Applies damage to a structure and removes it from state at 0 health.
 * Called from CombatSystem when a projectile hits a structure.
 */
function applyDamage(
    state: GameState,
    structureId: string,
    damage: number,
    broadcast?: Broadcast
): void {
    const structure = state.structures.get(structureId);
    if (!structure) return;

    structure.health -= damage;
    if (structure.health <= 0) {
        state.structures.delete(structureId);
        refreshOwner(state, structure.ownerId);
        broadcast?.('structureDestroyed', { structureId } satisfies StructureDestroyedEvent);
    }
}

export const StructureSystem = {
    canPlace,
    place,
    applyDamage,
    count,
    towerCount,
    canHold,
    hasFabricator,
    refreshOwner,
};
