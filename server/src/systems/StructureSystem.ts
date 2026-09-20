import type { GameState } from '../state/GameState';

/**
 * Applies damage to a structure and removes it from state at 0 health.
 * Called from CombatSystem once projectile/structure collision is wired in.
 */
function applyDamage(state: GameState, structureId: string, damage: number): void {
  const structure = state.structures.get(structureId);
  if (!structure) return;

  structure.health -= damage;
  if (structure.health <= 0) {
    state.structures.delete(structureId);
    // TODO: broadcast 'structureDestroyed' event { structureId }
  }
}

export const StructureSystem = { applyDamage };
