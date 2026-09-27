import type { GameState, Player } from '../state/GameState';
import { DEV_CHEATS_ENABLED, DEV_MATERIALS } from '../constants';

// Materials are earned by claiming hexes nobody has claimed before (MATERIALS_PER_CLAIM, paid in
// CollisionSystem.claimTiles) and from material pickups (PickupSystem), and spent in the shop
// (ShopSystem). There's no timed payout any more (until 2026-09-26: 1 material per
// owned hex every 10 s).

/**
 * DEV ONLY (temporary): adds DEV_MATERIALS, so shop items can be tried without claiming for minutes.
 * Playing phase only, and refused when the server runs with NODE_ENV=production.
 */
function grantDevMaterials(state: GameState, player: Player, enabled = DEV_CHEATS_ENABLED): void {
    if (!enabled || state.phase.phase !== 'playing') return;
    player.materials += DEV_MATERIALS;
}

export const EconomySystem = { grantDevMaterials };
