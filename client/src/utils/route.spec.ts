import { describe, expect, it } from 'vitest';
import { gamePath, parseRoute } from './route';

describe('parseRoute', () => {
    it('maps the four paths to pages', () => {
        expect(parseRoute('/')).toEqual({ page: 'splash' });
        expect(parseRoute('/play')).toEqual({ page: 'games' });
        expect(parseRoute('/play/')).toEqual({ page: 'games' });
        expect(parseRoute('/play/new')).toEqual({ page: 'create' });
        expect(parseRoute('/game/K7QF')).toEqual({ page: 'game', code: 'K7QF' });
    });

    it('accepts a code in any case, and sends a bad one to the list', () => {
        expect(parseRoute('/game/k7qf')).toEqual({ page: 'game', code: 'K7QF' });
        expect(parseRoute('/game/NOPE0')).toEqual({ page: 'games' });
        expect(parseRoute('/game/O0I1')).toEqual({ page: 'games' }); // ambiguous characters
        expect(parseRoute('/somewhere/else')).toEqual({ page: 'splash' });
    });

    it('builds a game path', () => {
        expect(gamePath('K7QF')).toBe('/game/K7QF');
        expect(parseRoute(gamePath('K7QF'))).toEqual({ page: 'game', code: 'K7QF' });
    });
});
