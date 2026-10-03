import { STRUCTURE_NAMES, isStructureType, type StructureType } from '../types/shared';

const STRUCTURE_ORDER = Object.keys(STRUCTURE_NAMES) as StructureType[];

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

/**
 * Tab in build mode: the structure type after `current` among the ones held, in catalog order
 * (Farm, Fabricator, Guard Tower, Power plant), wrapping around; `step` -1 goes backwards (Shift+Tab).
 * Undefined when nothing is held.
 */
export function cycleStructure(
    inventory: readonly string[] | undefined,
    current: StructureType | undefined,
    step: 1 | -1 = 1
): StructureType | undefined {
    const held = STRUCTURE_ORDER.filter((type) => inventory?.includes(type));
    if (held.length === 0) return undefined;
    const at = current ? held.indexOf(current) : -1;
    if (at === -1) return held[step === 1 ? 0 : held.length - 1];
    return held[(at + step + held.length) % held.length];
}
