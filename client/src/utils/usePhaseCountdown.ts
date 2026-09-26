import { useEffect, useState } from 'react';

/**
 * Whole seconds left until `endsAt` (a server epoch timestamp in ms), re-checked every
 * `tickMs` (once a second by default; short countdowns want it finer so the first number
 * shown isn't up to a second stale), or null when the phase has no timer (`endsAt` <= 0, e.g. the lobby).
 * Date.now() is impure, so the clock lives in state updated from an effect rather
 * than being read during render.
 */
export function usePhaseCountdown(endsAt: number, tickMs = 1000): number | null {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const interval = window.setInterval(() => setNow(Date.now()), tickMs);
        return () => window.clearInterval(interval);
    }, [tickMs]);

    return endsAt > 0 ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : null;
}
