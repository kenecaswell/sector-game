import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePhaseCountdown } from './usePhaseCountdown';

describe('usePhaseCountdown', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-26T12:00:00Z'));
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('is null when the phase has no timer', () => {
        const { result } = renderHook(() => usePhaseCountdown(0));
        expect(result.current).toBeNull();
    });

    it('counts whole seconds down, rounding up, and stops at 0', () => {
        const endsAt = Date.now() + 2500;
        const { result } = renderHook(() => usePhaseCountdown(endsAt));
        expect(result.current).toBe(3);
        act(() => vi.advanceTimersByTime(1000));
        expect(result.current).toBe(2);
        act(() => vi.advanceTimersByTime(5000));
        expect(result.current).toBe(0);
    });

    it('re-checks at a finer tick when asked (for short countdowns)', () => {
        const endsAt = Date.now() + 3000;
        const { result } = renderHook(() => usePhaseCountdown(endsAt, 100));
        act(() => vi.advanceTimersByTime(1100));
        // With the default 1s tick this would still read 2 until the next full second.
        expect(result.current).toBe(2);
        act(() => vi.advanceTimersByTime(1000));
        expect(result.current).toBe(1);
    });
});
