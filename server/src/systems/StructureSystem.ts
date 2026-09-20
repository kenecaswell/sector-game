import type { GameState } from '../state/GameState';
import type { Broadcast } from './Broadcast';
import type { StructureDestroyedEvent } from '../types/shared';

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

export const StructureSystem = { applyDamage };
