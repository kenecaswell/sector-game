import { describe, expect, it, vi } from 'vitest';
import { loadPlayerName, savePlayerName } from './playerName';

describe('saved player name', () => {
    it('is undefined until something is saved', () => {
        expect(loadPlayerName()).toBeUndefined();
    });

    it('round-trips through localStorage', () => {
        savePlayerName('K.C. the Explorer');
        expect(loadPlayerName()).toBe('K.C. the Explorer');
        expect(localStorage.getItem('sector42.playerName')).toBe('K.C. the Explorer');
    });

    it("doesn't throw when storage is unavailable (private browsing, blocked site data)", () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('SecurityError');
        });
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('QuotaExceededError');
        });
        expect(() => savePlayerName('Ada')).not.toThrow();
        expect(loadPlayerName()).toBeUndefined();
    });
});
