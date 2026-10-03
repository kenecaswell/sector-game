import { useEffect, useRef, useState } from 'react';
import type { PlayerState } from '../types/gameState';
import type { ShopItemId, StructureType } from '../types/shared';
import { SHOP_ITEMS, STRUCTURE_SPECS, STRUCTURE_TYPES, structurePoints } from '../types/shared';
import { ItemIcon } from './ItemIcon';
import { MENU_BUTTON_CSS } from './menuStyles';
import { UpgradesPanel } from './UpgradesPanel';

const MADE_FLASH_MS = 700;

export type BuildMenuTab = 'structures' | 'upgrades';

export interface BuildMenuProps {
    player: PlayerState | undefined;
    /** Which tab is showing. The Upgrades tab needs a Fabricator, so without one it shows Structures. */
    tab: BuildMenuTab;
    onTabChange: (tab: BuildMenuTab) => void;
    /** Fabricate a gun, ammo or an upgrade (the Upgrades tab; a `purchase` message). */
    onFabricate: (itemId: ShopItemId) => void;
    /** Buy one more of a structure (a `purchase` message; structures need no Fabricator). */
    onBuy: (itemId: ShopItemId) => void;
    /** Start placing a structure you hold (the menu closes). */
    onPlace: (type: StructureType) => void;
    onClose: () => void;
    /** How many Guard Towers a player may have in this game (by map size); omit for no limit. */
    towerLimit?: number;
}

/**
 * The Build popup over the game canvas, with two tabs. **Structures**: buy structures from
 * materials and start placing the ones you hold; never locked, since this is where you buy the first
 * Fabricator. **Upgrades**: fabricate guns, ammo and upgrades (the Fabricator popup until
 * 2026-10-03); grayed out until you own a Fabricator. GameScreen opens it from the Build button or
 * `B` (Structures) and `F` / `U` (Upgrades) during the match. Clicking the dimmed backdrop, the close
 * button, or pressing Esc closes it.
 */
export function BuildMenu({
    player,
    tab,
    onTabChange,
    onFabricate,
    onBuy,
    onPlace,
    onClose,
    towerLimit,
}: BuildMenuProps) {
    const hasFabricator = player?.hasFabricator ?? false;
    const activeTab: BuildMenuTab = tab === 'upgrades' && hasFabricator ? 'upgrades' : 'structures';
    const materials = player?.materials ?? 0;
    const [boughtId, setBoughtId] = useState<ShopItemId | null>(null);
    const boughtTimer = useRef<number | undefined>(undefined);
    useEffect(() => () => window.clearTimeout(boughtTimer.current), []);

    const handleBuy = (itemId: ShopItemId) => {
        onBuy(itemId);
        setBoughtId(itemId);
        window.clearTimeout(boughtTimer.current);
        boughtTimer.current = window.setTimeout(() => setBoughtId(null), MADE_FLASH_MS);
    };

    const held = (type: StructureType) =>
        player?.structureInventory.filter((t) => t === type).length ?? 0;

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
                aria-label="Build"
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: 440,
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
                    <strong style={{ fontSize: 18 }}>Build</strong>
                    <button
                        type="button"
                        aria-label="Close build menu"
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
                        flexWrap: 'wrap',
                    }}
                >
                    <span style={{ color: '#f1c40f' }}>Materials: {materials}</span>
                    <span>
                        Tiles: {player?.tilesOwned ?? 0} / {player?.tileCap ?? 0}
                    </span>
                </div>

                <div role="tablist" aria-label="Build menu" style={{ display: 'flex', gap: 6 }}>
                    {(
                        [
                            ['structures', 'Structures', false],
                            ['upgrades', 'Upgrades', !hasFabricator],
                        ] as const
                    ).map(([id, label, locked]) => (
                        <button
                            key={id}
                            type="button"
                            role="tab"
                            aria-selected={activeTab === id}
                            disabled={locked}
                            title={locked ? 'Build a Fabricator to unlock this' : undefined}
                            onClick={() => onTabChange(id)}
                            style={{
                                flex: 1,
                                padding: '8px 10px',
                                borderRadius: 8,
                                border: 'none',
                                background:
                                    activeTab === id ? '#f1c40f' : 'rgba(255, 255, 255, 0.1)',
                                color: activeTab === id ? '#000' : '#fff',
                                fontWeight: 'bold',
                                fontSize: 14,
                                opacity: locked ? 0.4 : 1,
                                cursor: locked ? 'not-allowed' : 'pointer',
                            }}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                {activeTab === 'upgrades' ? (
                    <UpgradesPanel player={player} onFabricate={onFabricate} />
                ) : (
                    <div role="tabpanel" aria-label="Structures">
                        <div style={{ margin: '10px 0', opacity: 0.8 }}>
                            Buy a structure here, then place it on ground that is all yours.
                            {!hasFabricator &&
                                ' Build a Fabricator to unlock the Upgrades tab (guns, ammo and upgrades).'}
                        </div>

                        {STRUCTURE_TYPES.map((type) => {
                            const item = SHOP_ITEMS[type];
                            const spec = STRUCTURE_SPECS[type];
                            const points = structurePoints(type, player?.character ?? '');
                            // Guard Towers are limited: standing plus held ones count toward it.
                            const limit = type === 'guardTower' ? towerLimit : undefined;
                            const owned =
                                limit === undefined ? 0 : (player?.towersBuilt ?? 0) + held(type);
                            const atLimit = limit !== undefined && owned >= limit;
                            const affordable = materials >= item.cost;
                            const bought = boughtId === type;
                            const have = held(type);
                            return (
                                <div
                                    key={type}
                                    role="group"
                                    aria-label={spec.name}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: 8,
                                        padding: '8px 0',
                                        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <ItemIcon kind="structure" id={type} size={28} />
                                        <div>
                                            <div style={{ fontWeight: 'bold' }}>{spec.name}</div>
                                            <div style={{ fontSize: 12, opacity: 0.7 }}>
                                                {spec.description}
                                            </div>
                                            <div style={{ fontSize: 12, opacity: 0.55 }}>
                                                +{points} points · {spec.health} health
                                                {have > 0 && ` · You have ${have}`}
                                                {limit !== undefined &&
                                                    ` · ${owned} / ${limit} allowed`}
                                            </div>
                                        </div>
                                    </div>
                                    <div
                                        style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
                                    >
                                        <button
                                            type="button"
                                            className={
                                                bought ? 'fab-make fab-make--made' : 'fab-make'
                                            }
                                            disabled={!affordable || atLimit}
                                            title={
                                                atLimit
                                                    ? `You can have at most ${limit} Guard Towers`
                                                    : affordable
                                                      ? 'Buy one'
                                                      : 'Not enough materials'
                                            }
                                            onClick={() => handleBuy(type)}
                                        >
                                            {bought ? '✓' : `${item.cost} mat`}
                                        </button>
                                        {have > 0 && (
                                            <button
                                                type="button"
                                                className="fab-make"
                                                title="Pick a spot for it"
                                                onClick={() => onPlace(type)}
                                            >
                                                Place
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
