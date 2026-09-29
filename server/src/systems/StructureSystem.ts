import { Structure, type GameState, type Player } from '../state/GameState';
import type { Broadcast } from './Broadcast';
import { isStructureType, type StructureDestroyedEvent } from '../types/shared';
import { hexIndex, inStructureFootprint, isValidHex, structureFootprint } from '../hex';

/**
 * Whether `playerId` may build a structure centered on hex (col, row): all 7 hexes of its
 * footprint must be on the map (so not at the edge), owned by that player (a teammate's don't
 * count), and not part of another structure's footprint.
 */
function canPlace(state: GameState, playerId: string, col: number, row: number): boolean {
    for (const hex of structureFootprint(col, row)) {
        // Validate first — an out-of-range column would otherwise wrap onto another row.
        if (!isValidHex(hex.col, hex.row, state.mapWidth, state.mapHeight)) return false;
        if (state.tiles[hexIndex(hex.col, hex.row, state.mapWidth)]?.ownerId !== playerId) {
            return false;
        }
        for (const other of state.structures.values()) {
            if (inStructureFootprint(hex.col, hex.row, other.tileX, other.tileY)) return false;
        }
    }
    return true;
}

/**
 * `player` places a structure of `type` from their inventory, centered on hex (col, row), if it's
 * the match, they hold one, and `canPlace` allows the spot. One is used up. Returns whether it was
 * placed. People place from GameRoom's `placeStructure` message, bots from BotSystem.
 */
function place(state: GameState, player: Player, type: unknown, col: number, row: number): boolean {
    if (state.phase.phase !== 'playing' || !player.connected || !isStructureType(type))
        return false;
    const slot = player.structureInventory.indexOf(type);
    if (slot === -1 || !canPlace(state, player.id, col, row)) return false;

    const structure = new Structure();
    structure.id = `struct-${col}-${row}`;
    structure.ownerId = player.id;
    structure.tileX = col;
    structure.tileY = row;
    structure.type = type;
    player.structureInventory.splice(slot, 1);
    state.structures.set(structure.id, structure);
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
        broadcast?.('structureDestroyed', { structureId } satisfies StructureDestroyedEvent);
    }
}

export const StructureSystem = { canPlace, place, applyDamage };
