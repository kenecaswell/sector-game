import type { ReactNode } from 'react';
import type { PlayerState } from '../types/gameState';
import type { GunId } from '../types/shared';
import {
    GUN_NAMES,
    STRUCTURE_NAMES,
    UPGRADES,
    UPGRADE_IDS,
    isStructureType,
    upgradeEffect,
    upgradeLabel,
    upgradeLevel,
    type UpgradeId,
} from '../types/shared';
import { usePhaseCountdown } from '../utils/usePhaseCountdown';

// Real CSS for :hover / :disabled (inline styles can't); prefixed so it can't collide.
const INVENTORY_CSS = `
.inv-equip {
    flex-shrink: 0;
    min-width: 84px;
    padding: 6px 10px;
    border: none;
    border-radius: 6px;
    background: #f1c40f;
    color: #000;
    font-weight: bold;
    cursor: pointer;
    transition: transform 90ms ease, background-color 120ms ease;
}
.inv-equip:not(:disabled):hover { background: #ffd84a; }
.inv-equip:not(:disabled):active { transform: scale(0.94); }
.inv-equip:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.inv-equip--on { background: #2ecc71; color: #fff; }
.inv-equip--on:not(:disabled):hover { background: #27b463; }
.inv-equip:disabled {
    background: rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.5);
    cursor: default;
}
`;

interface InventoryProps {
    player: PlayerState | undefined;
    /** Ask the server to equip a slot upgrade, or '' to empty the slot. */
    onEquip: (upgradeId: UpgradeId | '') => void;
    /** True while the player is over a mountain or deep water (Wings can't come off there). */
    overSolidTerrain: () => boolean;
    onClose: () => void;
}

/**
 * Inventory popup over the game canvas (I, or the Inventory button): your gun, ammo, structures
 * and upgrades. Only one slot upgrade (Booster, Expander, Wings) works at a time; this is where you
 * switch it, at most once every UPGRADE_SWITCH_COOLDOWN_MS. Armor always works. The server checks
 * every switch; the buttons just avoid offering ones it would refuse.
 */
export function Inventory({ player, onEquip, overSolidTerrain, onClose }: InventoryProps) {
    // Ticks a few times a second, which also keeps the Wings-over-terrain check current.
    const secondsLeft = usePhaseCountdown(player?.upgradeSwitchReadyAt ?? 0, 200);
    const coolingDown = secondsLeft !== null && secondsLeft > 0;
    const wingsStuck = player?.equippedUpgrade === 'wings' && overSolidTerrain();
    const owned = player
        ? UPGRADE_IDS.filter((id) => UPGRADES[id].slot && upgradeLevel(player, id) > 0)
        : [];

    let note = 'One upgrade works at a time. Armor is always on.';
    if (coolingDown) note = `You can switch again in ${secondsLeft}s.`;
    else if (wingsStuck) note = "You can't take Wings off over a mountain or deep water.";

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
            <style>{INVENTORY_CSS}</style>
            <div
                role="dialog"
                aria-label="Inventory"
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: 400,
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
                    <strong style={{ fontSize: 18 }}>Inventory</strong>
                    <button
                        type="button"
                        aria-label="Close inventory"
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

                <Section title="Weapons">
                    <Row
                        name={GUN_NAMES[player?.gun as GunId] ?? 'No gun'}
                        detail={`${player?.ammo ?? 0} ammo`}
                    />
                </Section>

                <Section title="Structures">
                    {structureRows(player?.structureInventory ?? [])}
                </Section>

                <Section title="Upgrades">
                    <div
                        aria-live="polite"
                        style={{ fontSize: 12, opacity: 0.75, margin: '2px 0 6px' }}
                    >
                        {note}
                    </div>
                    {player && player.armorLevel > 0 && (
                        <Row
                            name={upgradeLabel('armor', player.armorLevel)}
                            detail={upgradeEffect('armor', player.armorLevel)}
                        />
                    )}
                    {owned.length === 0 && (!player || player.armorLevel === 0) && (
                        <Row name="None yet" detail="Buy upgrades in the shop (E)." />
                    )}
                    {player &&
                        owned.map((id) => {
                            const level = upgradeLevel(player, id);
                            const equipped = player.equippedUpgrade === id;
                            const disabled = coolingDown || wingsStuck;
                            return (
                                <Row
                                    key={id}
                                    name={upgradeLabel(id, level)}
                                    detail={upgradeEffect(id, level)}
                                >
                                    <button
                                        type="button"
                                        className={
                                            equipped ? 'inv-equip inv-equip--on' : 'inv-equip'
                                        }
                                        aria-pressed={equipped}
                                        disabled={disabled}
                                        title={
                                            equipped
                                                ? 'Take it off (empty the slot)'
                                                : 'Use this upgrade'
                                        }
                                        onClick={() => onEquip(equipped ? '' : id)}
                                    >
                                        {equipped ? 'Unequip' : 'Equip'}
                                    </button>
                                </Row>
                            );
                        })}
                </Section>
            </div>
        </div>
    );
}

/** "Farm ×2" rows, or a single "None" row. */
function structureRows(inventory: readonly string[]): ReactNode {
    const counts = new Map<string, number>();
    inventory.forEach((type) => counts.set(type, (counts.get(type) ?? 0) + 1));
    if (counts.size === 0) return <Row name="None" detail="Buy structures in the shop (E)." />;
    return Array.from(counts, ([type, count]) => (
        <Row
            key={type}
            name={isStructureType(type) ? STRUCTURE_NAMES[type] : type}
            detail={count > 1 ? `×${count}` : '×1'}
        />
    ));
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section aria-label={title}>
            <div
                style={{
                    fontSize: 12,
                    letterSpacing: 1,
                    opacity: 0.6,
                    margin: '12px 0 2px',
                    textTransform: 'uppercase',
                }}
            >
                {title}
            </div>
            {children}
        </section>
    );
}

function Row({ name, detail, children }: { name: string; detail: string; children?: ReactNode }) {
    return (
        <div
            role="group"
            aria-label={name}
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
                <div style={{ fontWeight: 'bold' }}>{name}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>{detail}</div>
            </div>
            {children}
        </div>
    );
}
