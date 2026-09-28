import { useEffect, useState } from 'react';
import { fetchGames as fetchGamesFromServer } from '../net/GameConnection';
import { normalizeGameCode, type GameListing } from '../types/shared';
import { filterGames, settingsSummary } from '../utils/games';
import { MENU_CSS } from './menuStyles';
import { MenuHeader } from './MenuHeader';
import { MenuFooter } from './MenuFooter';

const REFRESH_MS = 3000;

interface GamesScreenProps {
    onCreate: () => void;
    onJoin: (code: string) => void;
    onBack: () => void;
    /** For tests; defaults to GET /games on the server. */
    fetchGames?: (signal: AbortSignal) => Promise<GameListing[]>;
}

/**
 * The game list (after Play): "Create game" at the top, a filter by code or name, and the open
 * games, refreshed every few seconds. Picking one joins it. Typing a full code that isn't listed
 * offers to join it anyway (a game can also be reached straight from its URL, /game/CODE).
 */
export function GamesScreen({
    onCreate,
    onJoin,
    onBack,
    fetchGames = fetchGamesFromServer,
}: GamesScreenProps) {
    const [games, setGames] = useState<GameListing[] | null>(null);
    const [failed, setFailed] = useState(false);
    const [filter, setFilter] = useState('');

    useEffect(() => {
        const controller = new AbortController();
        let timer: number | undefined;
        const load = () => {
            fetchGames(controller.signal)
                .then((list) => {
                    setGames(list);
                    setFailed(false);
                })
                .catch(() => {
                    if (!controller.signal.aborted) setFailed(true);
                })
                .finally(() => {
                    if (!controller.signal.aborted) timer = window.setTimeout(load, REFRESH_MS);
                });
        };
        load();
        return () => {
            controller.abort();
            window.clearTimeout(timer);
        };
    }, [fetchGames]);

    const shown = filterGames(games ?? [], filter);
    const typedCode = normalizeGameCode(filter);
    const offerCode =
        typedCode && !shown.some((game) => game.code === typedCode) ? typedCode : null;

    return (
        <main className="menu-screen">
            <style>{MENU_CSS}</style>
            <div className="menu-column">
                <MenuHeader onBack={onBack} />
                <h1 className="menu-title">Games</h1>

                <button type="button" className="menu-card menu-card--create" onClick={onCreate}>
                    <span>＋ Create game</span>
                    <span className="menu-muted" style={{ fontWeight: 'normal' }}>
                        Pick the map and rules
                    </span>
                </button>

                <label className="menu-field" style={{ display: 'block' }}>
                    <span className="menu-label">Find a game</span>
                    <input
                        className="menu-input"
                        type="search"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder="Game code or name"
                        autoComplete="off"
                        spellCheck={false}
                    />
                </label>

                {offerCode && (
                    <button type="button" className="menu-card" onClick={() => onJoin(offerCode)}>
                        <span>
                            Join game <span className="menu-code">{offerCode}</span>
                        </span>
                        <span className="menu-muted">Not listed, but you can try its code</span>
                    </button>
                )}

                <div role="list" aria-label="Open games" style={{ marginTop: 8 }}>
                    {shown.map((game) => {
                        const full = game.players >= game.maxPlayers;
                        return (
                            <div role="listitem" key={game.code}>
                                <button
                                    type="button"
                                    className="menu-card"
                                    disabled={full}
                                    aria-label={`Join ${game.name} (${game.code})`}
                                    onClick={() => onJoin(game.code)}
                                >
                                    <span>
                                        <strong>{game.name}</strong>{' '}
                                        <span className="menu-code">{game.code}</span>
                                        <span className="menu-muted" style={{ display: 'block' }}>
                                            {settingsSummary(game)}
                                        </span>
                                    </span>
                                    <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        <span style={{ display: 'block' }}>
                                            {game.players} / {game.maxPlayers}
                                        </span>
                                        <span className="menu-muted">
                                            {full
                                                ? 'Full'
                                                : game.phase === 'lobby'
                                                  ? 'In the lobby'
                                                  : 'In play'}
                                        </span>
                                    </span>
                                </button>
                            </div>
                        );
                    })}
                </div>

                <p className="menu-muted" aria-live="polite" style={{ marginTop: 16 }}>
                    {failed
                        ? "Can't reach the game server. Trying again…"
                        : games === null
                          ? 'Looking for games…'
                          : games.length === 0
                            ? 'No open games yet. Create one!'
                            : shown.length === 0 && !offerCode
                              ? 'No games match.'
                              : ''}
                </p>
            </div>
            <MenuFooter />
        </main>
    );
}
