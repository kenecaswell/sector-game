import { describe, expect, it } from 'vitest';
import { pickupLook } from './pickups';
import {
    PICKUP_COIN_COLOR,
    PICKUP_GUN_COLORS,
    PICKUP_UPGRADE_COLORS,
    STRUCTURE_COLORS,
} from './constants';
import { UPGRADE_IDS } from '../types/shared';

describe('pickupLook', () => {
    it('credits are a gold coin and ammo is rounds', () => {
        expect(pickupLook('credits', '')).toMatchObject({
            shape: 'coin',
            color: PICKUP_COIN_COLOR,
        });
        expect(pickupLook('ammo', '').shape).toBe('ammo');
    });

    it('guns are colored like their shots; the big gun is drawn larger', () => {
        expect(pickupLook('item', 'basicGun')).toEqual({
            shape: 'gun',
            color: PICKUP_GUN_COLORS.basicGun,
            scale: 1,
        });
        expect(pickupLook('item', 'bigGun')).toMatchObject({ shape: 'gun', scale: 1.3 });
    });

    it('each upgrade is a diamond in its own color', () => {
        const colors = UPGRADE_IDS.map((id) => pickupLook('item', id));
        expect(colors.every((look) => look.shape === 'upgrade')).toBe(true);
        expect(colors.map((look) => look.color)).toEqual(
            UPGRADE_IDS.map((id) => PICKUP_UPGRADE_COLORS[id])
        );
        expect(new Set(colors.map((look) => look.color)).size).toBe(UPGRADE_IDS.length);
    });

    it('structures are a tiny slab in the type color', () => {
        expect(pickupLook('item', 'mine')).toMatchObject({
            shape: 'structure',
            color: STRUCTURE_COLORS.mine,
        });
    });
});
