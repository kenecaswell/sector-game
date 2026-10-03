import { useEffect, useRef, useState } from 'react';
import type { PlayerState } from '../types/gameState';
import { MENU_BUTTON_CSS } from './menuStyles';
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

interface FabricatorMenuProps {
    player: PlayerState | undefined;
    onFabricate: (itemId: ShopItemId) => void;
    onClose: () => void;
}

// The Fabricator makes guns, ammo and upgrades. Structures are bought in the Build menu instead
// (BuildMenu), which needs no Fabricator, so the first Fabricator can be bought.
const FABRICATOR_CATEGORIES: ShopCategory[] = ['weapons', 'upgrades'];

/**
 * The Fabricator popup over the game canvas (the Shop until 2026-09-27; the catalog and the
 * `purchase` message keep their shop names in code): make items from materials. GameScreen shows it
 * from the Fabricator button or `F` during the match, once you own a Fabricator structure. Items
 * are grouped by category, straight from the shared SHOP_ITEMS catalog, and cost materials. Clicking the dimmed backdrop, the close button, or pressing Esc closes it. The server
 * validates every request; the buttons just avoid offering ones that would be rejected (not enough
 * materials, or `ownsShopItem`: an upgrade you already have or a gun that isn't better than yours).
 */
export function FabricatorMenu({ player, onFabricate, onClose }: FabricatorMenuProps) {
    const materials = player?.materials ?? 0;
    // Which item's button is showing its "made" confirmation right now. It's shown when the
    // button is pressed (the server accepts any request the button allowed, barring a race).
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
        <div
            role="presentation"
            onClick={onClose}
            style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.45)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
                boxSizing: 'border-box',
            }}
        >
            <style>{MENU_BUTTON_CSS}</style>
            <div
                role="dialog"
                aria-label="Fabricator"
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: 420,
                    maxWidth: '100%',
                    maxHeight: '100%',
                    overflowY: 'auto',
                    padding: '12px 16px 16px',
                    borderRadius: 10,
                    background: 'rgba(20, 20, 35, 0.96)',
                    color: '#fff',
                    fontFamily: 'sans-serif',
                    fontSize: 14,
                    textAlign: 'left',
                    boxSizing: 'border-box',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                    }}
                >
                    <strong style={{ fontSize: 18 }}>Fabricator</strong>
                    <button
                        type="button"
                        aria-label="Close fabricator"
                        onClick={onClose}
                        style={{
                            border: 'none',
                            background: 'transparent',
                            color: '#fff',
                            fontSize: 20,
                            lineHeight: 1,
                            cursor: 'pointer',
                        }}
                    >
                        ×
                    </button>
                </div>

                <div
                    style={{
                        margin: '6px 0 10px',
                        display: 'flex',
                        gap: 16,
                        fontWeight: 'bold',
                    }}
                >
                    <span style={{ color: '#f1c40f' }}>Materials: {materials}</span>
                    <span>Ammo: {player?.ammo ?? 0}</span>
                    <span>{GUN_NAMES[player?.gun as GunId] ?? 'No gun'}</span>
                </div>

                <div style={{ marginBottom: 10, opacity: 0.8 }}>
                    Fabricating is on your own time — the game keeps running.
                </div>

                {FABRICATOR_CATEGORIES.map((category) => (
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
        </div>
    );
}
