import { describe, expect, it } from 'vitest';
import { cycleStructure, structureToBuild } from './build';

describe('structureToBuild', () => {
    it('builds the picked structure while you have one', () => {
        expect(structureToBuild(['farm', 'guardTower', 'farm'], 'guardTower')).toBe('guardTower');
    });

    it('falls back to the first in the inventory when none is picked or the pick ran out', () => {
        expect(structureToBuild(['farm', 'guardTower'], undefined)).toBe('farm');
        expect(structureToBuild(['fabricator', 'farm'], 'guardTower')).toBe('fabricator');
    });

    it('is undefined when there is nothing to build', () => {
        expect(structureToBuild([], 'farm')).toBeUndefined();
        expect(structureToBuild(undefined, undefined)).toBeUndefined();
    });
});

describe('cycleStructure (Tab in build mode)', () => {
    const held = ['guardTower', 'farm', 'farm', 'power'];

    it('steps through the types you hold in catalog order, wrapping around', () => {
        expect(cycleStructure(held, 'farm')).toBe('guardTower');
        expect(cycleStructure(held, 'guardTower')).toBe('power');
        expect(cycleStructure(held, 'power')).toBe('farm');
    });

    it('goes backwards with step -1 (Shift+Tab)', () => {
        expect(cycleStructure(held, 'farm', -1)).toBe('power');
        expect(cycleStructure(held, 'guardTower', -1)).toBe('farm');
    });

    it('starts at an end when the current one is no longer held; undefined with nothing held', () => {
        expect(cycleStructure(held, 'fabricator')).toBe('farm');
        expect(cycleStructure(held, undefined, -1)).toBe('power');
        expect(cycleStructure(['farm'], 'farm')).toBe('farm');
        expect(cycleStructure([], 'farm')).toBeUndefined();
    });
});
