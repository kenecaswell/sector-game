import type { GameState } from '../state/GameState';
import type { Broadcast } from './Broadcast';
import type { StructureDestroyedEvent } from '../types/shared';
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

export const StructureSystem = { canPlace, applyDamage };
