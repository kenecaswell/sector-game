import { useEffect, useRef, useState } from 'react';
import type { PlayerState } from '../types/gameState';
import type { GunId, ShopCategory, ShopItemId } from '../types/shared';
import {
    GUN_NAMES,
    SHOP_CATEGORY_NAMES,
    SHOP_ITEMS,
    SHOP_ITEM_IDS,
    ownsShopItem,
} from '../types/shared';

// Button looks live in real CSS because inline styles can't express :hover / :active. The class
// names are prefixed so they can't collide with anything else on the page.
const BUTTON_CSS = `
.shop-buy {
    flex-shrink: 0;
    min-width: 64px;
    padding: 6px 10px;
    border: none;
    border-radius: 6px;
    background: #f1c40f;
    color: #000;
    font-weight: bold;
    cursor: pointer;
    transition: transform 90ms ease, background-color 120ms ease, box-shadow 120ms ease;
}
.shop-buy:not(:disabled):hover { background: #ffd84a; }
.shop-buy:not(:disabled):active {
    background: #c9a20d;
    transform: scale(0.92);
    box-shadow: inset 0 2px 5px rgba(0, 0, 0, 0.4);
}
.shop-buy:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.shop-buy:disabled {
    background: rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.5);
    cursor: default;
}
.shop-buy--bought,
.shop-buy--bought:disabled {
    background: #2ecc71;
    color: #fff;
    transform: scale(1.08);
}
`;

const BOUGHT_FLASH_MS = 700;

interface BuyMenuProps {
    player: PlayerState | undefined;
    onBuy: (itemId: ShopItemId) => void;
    onClose: () => void;
}

/**
 * Shop popup over the game canvas; GameScreen lets players toggle it during the match (E). Items
 * are grouped by category, straight from the shared SHOP_ITEMS catalog. Clicking the dimmed
 * backdrop, the close button, or pressing Esc closes it. The server validates every purchase; the
 * buttons just avoid offering ones that would be rejected (not enough credits, or `ownsShopItem`:
 * an upgrade you already have or a gun that isn't better than yours).
 */
export function BuyMenu({ player, onBuy, onClose }: BuyMenuProps) {
    const credits = player?.credits ?? 0;
    // Which item's button is showing its "bought" confirmation right now. It's shown when the
    // button is pressed (the server accepts any purchase the button allowed, barring a race).
    const [boughtId, setBoughtId] = useState<ShopItemId | null>(null);
    const boughtTimer = useRef<number | undefined>(undefined);
    useEffect(() => () => window.clearTimeout(boughtTimer.current), []);

    const handleBuy = (itemId: ShopItemId) => {
        onBuy(itemId);
        setBoughtId(itemId);
        window.clearTimeout(boughtTimer.current);
        boughtTimer.current = window.setTimeout(() => setBoughtId(null), BOUGHT_FLASH_MS);
    };

    const buttonFor = (itemId: ShopItemId) => {
        const item = SHOP_ITEMS[itemId];
        const owned = !!player && ownsShopItem(player, itemId);
        const affordable = credits >= item.cost;
        const bought = boughtId === itemId;
        const label = bought ? '✓' : owned ? 'Owned' : `${item.cost} cr`;
        return (
            <button
                type="button"
                className={bought ? 'shop-buy shop-buy--bought' : 'shop-buy'}
                disabled={owned || !affordable}
                title={owned ? 'You already own this' : affordable ? 'Buy' : 'Not enough credits'}
                onClick={() => handleBuy(itemId)}
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
            <style>{BUTTON_CSS}</style>
            <div
                role="dialog"
                aria-label="Shop"
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
                    <strong style={{ fontSize: 18 }}>Shop</strong>
                    <button
                        type="button"
                        aria-label="Close shop"
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
                    <span style={{ color: '#f1c40f' }}>Credits: {credits}</span>
                    <span>Ammo: {player?.ammo ?? 0}</span>
                    <span>{GUN_NAMES[player?.gun as GunId] ?? 'No gun'}</span>
                </div>

                <div style={{ marginBottom: 10, opacity: 0.8 }}>
                    Shopping is on your own time — the game keeps running.
                </div>

                {(Object.keys(SHOP_CATEGORY_NAMES) as ShopCategory[]).map((category) => (
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
                                            {SHOP_ITEMS[itemId].name}
                                        </div>
                                        <div style={{ fontSize: 12, opacity: 0.7 }}>
                                            {SHOP_ITEMS[itemId].description}
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
