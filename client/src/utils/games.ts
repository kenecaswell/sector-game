import { MAP_SIZES, type GameListing } from '../types/shared';

/** The games whose code or name contains `filter` (ignoring case and surrounding spaces). */
export function filterGames(games: readonly GameListing[], filter: string): GameListing[] {
    const text = filter.trim().toLowerCase();
    if (!text) return [...games];
    return games.filter(
        (game) => game.code.toLowerCase().includes(text) || game.name.toLowerCase().includes(text)
    );
}

/** "Small map · Teams · Drop pods · 5 min", plus " · 3 bots" if it has any. */
export function settingsSummary(game: GameListing): string {
    const parts = [
        `${MAP_SIZES[game.mapSize]?.name ?? game.mapSize} map`,
        game.teams ? 'Teams' : 'No teams',
        game.pods ? 'Drop pods' : 'No pods',
        `${game.matchMinutes} min`,
    ];
    if (game.bots > 0) parts.push(game.bots === 1 ? '1 bot' : `${game.bots} bots`);
    return parts.join(' · ');
}
