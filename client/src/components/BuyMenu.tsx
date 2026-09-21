import type { GamePhase } from '../types/shared';
import { usePhaseCountdown } from '../utils/usePhaseCountdown';

interface MockItem {
    id: string;
    name: string;
    description: string;
}

// MOCK-UP CONTENT. The real item list, prices and effects are still to be designed; nothing in
// this menu is connected to the server yet. Replace this array (and wire the buttons to a
// `purchase` message) when the buy menu is built.
const MOCK_CATEGORIES: Array<{ title: string; items: MockItem[] }> = [
    {
        title: 'Weapons & ammo',
        items: [
            { id: 'gun', name: 'Better gun', description: 'More damage, faster fire rate' },
            { id: 'ammo', name: 'Ammo pack', description: 'Refill your ammo' },
        ],
    },
    {
        title: 'Protection',
        items: [{ id: 'armor', name: 'Armor', description: 'Take less damage from hits' }],
    },
    {
        title: 'Structures',
        items: [
            { id: 'fort', name: 'Fort', description: 'Cheap and sturdy' },
            { id: 'house', name: 'House', description: 'Worth more points' },
            { id: 'school', name: 'School', description: 'Worth even more points' },
            { id: 'city-hall', name: 'City Hall', description: 'The big prize' },
        ],
    },
];

interface BuyMenuProps {
    credits: number;
    phase: GamePhase;
    phaseEndsAt: number;
    onClose: () => void;
}

/**
 * Shop popup over the game canvas — a mock-up (see MOCK_CATEGORIES). GameScreen opens
 * it automatically during the `buying` phase and lets players toggle it during play.
 * Clicking the dimmed backdrop, the close button, or pressing Esc closes it.
 */
export function BuyMenu({ credits, phase, phaseEndsAt, onClose }: BuyMenuProps) {
    const secondsLeft = usePhaseCountdown(phaseEndsAt);

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

                <div style={{ margin: '6px 0 10px', color: '#f1c40f', fontWeight: 'bold' }}>
                    Credits: {credits}
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

                <div
                    style={{
                        marginBottom: 12,
                        padding: '6px 10px',
                        borderRadius: 6,
                        background: 'rgba(241, 196, 15, 0.15)',
                        border: '1px dashed rgba(241, 196, 15, 0.6)',
                        fontSize: 12,
                    }}
                >
                    Mock-up: items and prices are placeholders and nothing can be bought yet.
                </div>

                {MOCK_CATEGORIES.map((category) => (
                    <div key={category.title} style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
                            {category.title.toUpperCase()}
                        </div>
                        {category.items.map((item) => (
                            <div
                                key={item.id}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 8,
                                    padding: '6px 0',
                                    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                                }}
                            >
                                <div>
                                    <div style={{ fontWeight: 'bold' }}>{item.name}</div>
                                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                                        {item.description}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    disabled
                                    title="Not available yet"
                                    style={{
                                        flexShrink: 0,
                                        padding: '6px 10px',
                                        borderRadius: 6,
                                        border: '1px solid rgba(255, 255, 255, 0.25)',
                                        background: 'transparent',
                                        color: 'rgba(255, 255, 255, 0.5)',
                                    }}
                                >
                                    — cr
                                </button>
                            </div>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
