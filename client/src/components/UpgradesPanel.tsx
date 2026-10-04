import { useEffect, useRef, useState } from 'react';
import type { PlayerState } from '../types/gameState';
import type { GunId, ShopCategory, ShopItemId } from '../types/shared';
import {
    GUN_NAMES,
    SHOP_CATEGORY_NAMES,
    SHOP_ITEMS,
    SHOP_ITEM_IDS,
    ownsShopItem,
    shopItemDescription,
    shopItemTitle,
} from '../types/shared';

const MADE_FLASH_MS = 700;

// The Upgrades tab makes guns, ammo and upgrades (the old Fabricator menu). Structures are bought
// on the Structures tab, which needs no Fabricator, so the first Fabricator can be bought.
const UPGRADES_TAB_CATEGORIES: ShopCategory[] = ['weapons', 'upgrades'];

interface UpgradesPanelProps {
    player: PlayerState | undefined;
    onFabricate: (itemId: ShopItemId) => void;
    /** Whether the game has guns (the game's `guns` setting); without them no Weapons, gun or ammo. Default true. */
    guns?: boolean;
}

/**
 * The Upgrades tab of the Build menu (the Fabricator popup until 2026-10-03; the catalog and the
 * `purchase` message keep their shop names in code): make guns, ammo and upgrades from materials.
 * Items are grouped by category, straight from the shared SHOP_ITEMS catalog. The server validates
 * every request; the buttons just avoid offering ones that would be rejected (not enough materials,
 * or `ownsShopItem`: an upgrade you already have or a gun that isn't better than yours). With
 * `guns` false the Weapons section and your gun and ammo are left out.
 */
export function UpgradesPanel({ player, onFabricate, guns = true }: UpgradesPanelProps) {
    const materials = player?.materials ?? 0;
    const categories = UPGRADES_TAB_CATEGORIES.filter((c) => guns || c !== 'weapons');
    const [madeId, setMadeId] = useState<ShopItemId | null>(null);
    const madeTimer = useRef<number | undefined>(undefined);
    useEffect(() => () => window.clearTimeout(madeTimer.current), []);

    const handleFabricate = (itemId: ShopItemId) => {
        onFabricate(itemId);
        setMadeId(itemId);
        window.clearTimeout(madeTimer.current);
        madeTimer.current = window.setTimeout(() => setMadeId(null), MADE_FLASH_MS);
    };

    const buttonFor = (itemId: ShopItemId) => {
        const item = SHOP_ITEMS[itemId];
        const owned = !!player && ownsShopItem(player, itemId);
        const affordable = materials >= item.cost;
        const made = madeId === itemId;
        // A maxed upgrade reads "Max"; a gun you can't improve on reads "Owned".
        const label = made ? '✓' : owned ? (item.upgrade ? 'Max' : 'Owned') : `${item.cost} mat`;
        return (
            <button
                type="button"
                className={made ? 'fab-make fab-make--made' : 'fab-make'}
                disabled={owned || !affordable}
                title={
                    owned
                        ? item.upgrade
                            ? 'Already at the top level'
                            : 'You already have this'
                        : affordable
                          ? 'Fabricate'
                          : 'Not enough materials'
                }
                onClick={() => handleFabricate(itemId)}
            >
                {label}
            </button>
        );
    };

    return (
        <div role="tabpanel" aria-label="Upgrades">
            {guns && (
                <div
                    style={{
                        margin: '6px 0 10px',
                        display: 'flex',
                        gap: 16,
                        fontWeight: 'bold',
                    }}
                >
                    <span>Ammo: {player?.ammo ?? 0}</span>
                    <span>{GUN_NAMES[player?.gun as GunId] ?? 'No gun'}</span>
                </div>
            )}

            <div style={{ marginBottom: 10, opacity: 0.8 }}>
                Fabricating is on your own time — the game keeps running.
            </div>

            {categories.map((category) => (
                <section key={category} aria-label={SHOP_CATEGORY_NAMES[category]}>
                    <div
                        style={{
                            fontSize: 12,
                            letterSpacing: 1,
                            opacity: 0.6,
                            margin: '12px 0 2px',
                            textTransform: 'uppercase',
                        }}
                    >
                        {SHOP_CATEGORY_NAMES[category]}
                    </div>
                    {SHOP_ITEM_IDS.filter((id) => SHOP_ITEMS[id].category === category).map(
                        (itemId) => (
                            <div
                                key={itemId}
                                role="group"
                                aria-label={SHOP_ITEMS[itemId].name}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 8,
                                    padding: '8px 0',
                                    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                                }}
                            >
                                <div>
                                    <div style={{ fontWeight: 'bold' }}>
                                        {player
                                            ? shopItemTitle(player, itemId)
                                            : SHOP_ITEMS[itemId].name}
                                    </div>
                                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                                        {player
                                            ? shopItemDescription(player, itemId)
                                            : SHOP_ITEMS[itemId].description}
                                    </div>
                                </div>
                                {buttonFor(itemId)}
                            </div>
                        )
                    )}
                </section>
            ))}
        </div>
    );
}
