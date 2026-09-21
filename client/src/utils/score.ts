import type { PlayerState } from '../types/gameState';

/**
 * A player's score as shown in the score badge and leaderboard.
 *
 * The server computes it (ScoreSystem: 1 per tile owned, 50 per kill, a fixed
 * value per structure owned; credits are not part of it) and syncs it as
 * `Player.score`. Everything that displays or ranks by score goes through
 * here, so if it ever needs client-side derivation this is the one place.
 */
export function scoreFor(player: PlayerState): number {
    return player.score;
}
