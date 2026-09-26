// The player's chosen name, remembered across games (and page loads) in localStorage. Storage can
// be unavailable (private browsing, blocked site data), in which case names just aren't remembered.
const STORAGE_KEY = 'sector42.playerName';

export function loadPlayerName(): string | undefined {
    try {
        return localStorage.getItem(STORAGE_KEY) ?? undefined;
    } catch {
        return undefined;
    }
}

export function savePlayerName(name: string): void {
    try {
        localStorage.setItem(STORAGE_KEY, name);
    } catch {
        // ignore — see above
    }
}
