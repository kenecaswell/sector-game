import { useEffect, useState } from 'react';

/**
 * Whole seconds left until `endsAt` (a server epoch timestamp in ms), ticking once a
 * second, or null when the phase has no timer (`endsAt` <= 0, e.g. the lobby).
 * Date.now() is impure, so the clock lives in state updated from an effect rather
 * than being read during render.
 */
export function usePhaseCountdown(endsAt: number): number | null {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const interval = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(interval);
    }, []);

    return endsAt > 0 ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : null;
}
