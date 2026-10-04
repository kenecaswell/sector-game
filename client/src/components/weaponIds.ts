import type { ShopItemId } from '../types/shared';

/** The shop items that are weapons (the ones WeaponIcon draws). */
export type WeaponId = Extract<ShopItemId, 'basicGun' | 'bigGun' | 'ammo'>;

export function isWeaponId(id: string): id is WeaponId {
    return id === 'basicGun' || id === 'bigGun' || id === 'ammo';
}
