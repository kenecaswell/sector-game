import { useEffect, useState } from 'react';

/**
 * Re-renders the component every `ms` while it's mounted. For values React can't see change, such
 * as a player's live position read straight from the room (positions don't re-render React).
 */
export function useRerenderEvery(ms: number): void {
    const [, setTick] = useState(0);
    useEffect(() => {
        const timer = window.setInterval(() => setTick((tick) => tick + 1), ms);
        return () => window.clearInterval(timer);
    }, [ms]);
}
