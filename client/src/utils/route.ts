import { useEffect, useState } from 'react';
import { normalizeGameCode } from '../types/shared';

// The app's pages, from the URL path (no router library: four paths are enough):
//   /            splash (Play)
//   /play        the game list
//   /play/new    Create game
//   /game/CODE   a game: joins it, then shows its lobby, the match and the results
export type Route =
    { page: 'splash' } | { page: 'games' } | { page: 'create' } | { page: 'game'; code: string };

const CHANGE_EVENT = 'sector42:navigate';

export function parseRoute(path: string): Route {
    const parts = path.split('/').filter(Boolean);
    if (parts[0] === 'play') return parts[1] === 'new' ? { page: 'create' } : { page: 'games' };
    if (parts[0] === 'game' && parts[1]) {
        const code = normalizeGameCode(decodeURIComponent(parts[1]));
        if (code) return { page: 'game', code };
        return { page: 'games' }; // not a code: back to the list
    }
    return { page: 'splash' };
}

export function gamePath(code: string): string {
    return `/game/${code}`;
}

/** Goes to `path` (adds a history entry, or replaces the current one). */
export function navigate(path: string, { replace = false } = {}): void {
    if (window.location.pathname === path) return;
    if (replace) window.history.replaceState(null, '', path);
    else window.history.pushState(null, '', path);
    window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** The current route, updated on navigate() and on the browser's back/forward buttons. */
export function useRoute(): Route {
    const [route, setRoute] = useState(() => parseRoute(window.location.pathname));
    useEffect(() => {
        const update = () => setRoute(parseRoute(window.location.pathname));
        window.addEventListener('popstate', update);
        window.addEventListener(CHANGE_EVENT, update);
        return () => {
            window.removeEventListener('popstate', update);
            window.removeEventListener(CHANGE_EVENT, update);
        };
    }, []);
    return route;
}
