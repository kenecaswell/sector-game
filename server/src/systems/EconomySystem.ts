import type { GameState, Player } from '../state/GameState';
import { DEV_CHEATS_ENABLED, DEV_CREDITS } from '../constants';

// Credits are earned by claiming hexes nobody has claimed before (CREDITS_PER_CLAIM, paid in
// CollisionSystem.claimTiles) and from credit pickups (PickupSystem), and spent in the shop
// (ShopSystem). There's no timed payout any more (until 2026-09-26: 1 credit per
// owned hex every 10 s).

/**
 * DEV ONLY (temporary): adds DEV_CREDITS, so shop items can be tried without claiming for minutes.
 * Playing phase only, and refused when the server runs with NODE_ENV=production.
 */
function grantDevCredits(state: GameState, player: Player, enabled = DEV_CHEATS_ENABLED): void {
    if (!enabled || state.phase.phase !== 'playing') return;
    player.credits += DEV_CREDITS;
}

export const EconomySystem = { grantDevCredits };
