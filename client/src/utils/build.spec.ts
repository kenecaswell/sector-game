import { describe, expect, it } from 'vitest';
import { structureToBuild } from './build';

describe('structureToBuild', () => {
    it('builds the picked structure while you have one', () => {
        expect(structureToBuild(['farm', 'fort', 'farm'], 'fort')).toBe('fort');
    });

    it('falls back to the first in the inventory when none is picked or the pick ran out', () => {
        expect(structureToBuild(['farm', 'fort'], undefined)).toBe('farm');
        expect(structureToBuild(['mine', 'farm'], 'fort')).toBe('mine');
    });

    it('is undefined when there is nothing to build', () => {
        expect(structureToBuild([], 'farm')).toBeUndefined();
        expect(structureToBuild(undefined, undefined)).toBeUndefined();
    });
});
