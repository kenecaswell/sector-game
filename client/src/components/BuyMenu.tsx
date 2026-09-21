import { useEffect, useRef, useState } from 'react';
import type { GamePhase, ShopItemId } from '../types/shared';
import { SHOP_ITEMS } from '../types/shared';
import { usePhaseCountdown } from '../utils/usePhaseCountdown';

// Ideas that aren't buyable yet. Shown so the menu communicates what's coming; replace an entry
// with a real item in SHOP_ITEMS (types/shared.ts, mirrored on the server) when it's built.
const COMING_SOON = [
    { name: 'Better gun', description: 'More damage, faster fire rate' },
    { name: 'Armor', description: 'Take less damage from hits' },
    { name: 'Structures', description: 'Fort, house, school, city hall' },
];

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
    credits: number;
    ammo: number;
    hasExpander: boolean;
    phase: GamePhase;
    phaseEndsAt: number;
    onBuy: (itemId: ShopItemId) => void;
    onClose: () => void;
}

/**
 * Shop popup over the game canvas. GameScreen opens it automatically during the `buying` phase
 * and lets players toggle it during play. Clicking the dimmed backdrop, the close button, or
 * pressing Esc closes it. The server validates every purchase; the buttons just avoid offering
 * ones that would be rejected (not enough credits, or an upgrade you already own).
 */
export function BuyMenu({
    credits,
    ammo,
    hasExpander,
    phase,
    phaseEndsAt,
    onBuy,
    onClose,
}: BuyMenuProps) {
    const secondsLeft = usePhaseCountdown(phaseEndsAt);

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
        const owned = itemId === 'expander' && hasExpander;
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
                    <span>Ammo: {ammo}</span>
                </div>

                {phase === 'buying' && secondsLeft !== null ? (
                    <div style={{ marginBottom: 10 }}>
                        The match starts in <strong>{secondsLeft}s</strong>. You can keep shopping
                        during the match from the Shop button.
                    </div>
                ) : (
                    <div style={{ marginBottom: 10, opacity: 0.8 }}>
                        Shopping during the match is on your own time — the game keeps running.
                    </div>
                )}

                {(Object.keys(SHOP_ITEMS) as ShopItemId[]).map((itemId) => {
                    const item = SHOP_ITEMS[itemId];
                    return (
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
                                <div style={{ fontWeight: 'bold' }}>{item.name}</div>
                                <div style={{ fontSize: 12, opacity: 0.7 }}>{item.description}</div>
                            </div>
                            {buttonFor(itemId)}
                        </div>
                    );
                })}

                <div style={{ fontSize: 12, opacity: 0.7, margin: '12px 0 4px' }}>COMING SOON</div>
                {COMING_SOON.map((entry) => (
                    <div
                        key={entry.name}
                        style={{
                            padding: '6px 0',
                            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                            opacity: 0.5,
                        }}
                    >
                        <div style={{ fontWeight: 'bold' }}>{entry.name}</div>
                        <div style={{ fontSize: 12 }}>{entry.description}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
