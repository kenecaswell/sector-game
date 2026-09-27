import { isStructureType, type StructureType } from '../types/shared';

/**
 * The structure Build places next: the one the player picked in the inventory while they still
 * have one, otherwise the first in their inventory. Undefined when there's nothing to build.
 */
export function structureToBuild(
    inventory: readonly string[] | undefined,
    selected: StructureType | undefined
): StructureType | undefined {
    if (!inventory) return undefined;
    if (selected && inventory.includes(selected)) return selected;
    const first = inventory[0];
    return isStructureType(first) ? first : undefined;
}
