import type { ReactNode } from 'react';
import type { PlayerState } from '../types/gameState';
import {
    STRUCTURE_NAMES,
    UPGRADES,
    UPGRADE_IDS,
    upgradeEffect,
    upgradeLabel,
    upgradeLevel,
    type StructureType,
    type UpgradeId,
} from '../types/shared';
import { useRerenderEvery } from '../utils/useRerenderEvery';
import { ItemIcon } from './ItemIcon';

const WINGS_CHECK_MS = 200;
const STRUCTURE_ORDER = Object.keys(STRUCTURE_NAMES) as StructureType[];

// Real CSS for :hover / :active / :disabled (inline styles can't); prefixed so it can't collide.
const BAR_CSS = `
.invbar-slot {
    position: relative;
    width: 48px;
    height: 48px;
    padding: 0;
    border: 2px solid transparent;
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: transform 90ms ease, background-color 120ms ease, border-color 120ms ease;
}
.invbar-slot:not(:disabled):hover { background: rgba(0, 0, 0, 0.75); border-color: rgba(255, 255, 255, 0.5); }
.invbar-slot:not(:disabled):active { transform: scale(0.92); }
.invbar-slot--on { border-color: #f1c40f; background: rgba(241, 196, 15, 0.25); }
.invbar-slot--on:disabled { cursor: default; }
.invbar-slot:disabled:not(.invbar-slot--on) { opacity: 0.45; cursor: default; }
.invbar-badge {
    position: absolute;
    right: -4px;
    bottom: -4px;
    min-width: 18px;
    padding: 1px 4px;
    border-radius: 9px;
    background: #fff;
    color: #000;
    font: bold 11px/16px sans-serif;
    text-align: center;
}
`;

interface InventoryBarProps {
    player: PlayerState | undefined;
    /** The structure type build mode is armed with, or undefined when it isn't armed. */
    building: StructureType | undefined;
    /** A structure icon was clicked: start building that type (or stop, if it's the armed one). */
    onBuild: (type: StructureType) => void;
    /** An upgrade icon was clicked: switch to it. */
    onEquip: (upgradeId: UpgradeId) => void;
    /** True while the player is over a mountain or deep water (Jetpack can't come off there). */
    overSolidTerrain: () => boolean;
}

/**
 * The player's inventory on the HUD, down the right side: an icon per structure type they hold
 * (with the count) that starts building it, and an icon per upgrade they own (with the level) that
 * switches to it. Armor is shown but always on. Replaced the Build button and the Inventory popup
 * (2026-09-27); I hides and shows it (GameScreen).
 */
export function InventoryBar({
    player,
    building,
    onBuild,
    onEquip,
    overSolidTerrain,
}: InventoryBarProps) {
    useRerenderEvery(WINGS_CHECK_MS); // keeps the Jetpack-over-terrain check current
    if (!player) return null;

    const counts = new Map<StructureType, number>();
    for (const type of player.structureInventory) {
        const known = STRUCTURE_ORDER.find((t) => t === type);
        if (known) counts.set(known, (counts.get(known) ?? 0) + 1);
    }
    const structures = STRUCTURE_ORDER.filter((type) => counts.has(type));
    const upgrades = UPGRADE_IDS.filter((id) => upgradeLevel(player, id) > 0);
    if (structures.length === 0 && upgrades.length === 0) return null;
    const wingsStuck = player.equippedUpgrade === 'wings' && overSolidTerrain();

    return (
        <div
            aria-label="Inventory bar"
            role="toolbar"
            aria-orientation="vertical"
            style={{
                position: 'absolute',
                top: 106, // under the Leaderboard and Build buttons
                right: 12,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: 6,
                fontFamily: 'sans-serif',
            }}
        >
            <style>{BAR_CSS}</style>
            {structures.length > 0 && <Heading>Structures</Heading>}
            {structures.map((type) => {
                const armed = building === type;
                const name = STRUCTURE_NAMES[type];
                return (
                    <Slot
                        key={type}
                        label={armed ? `Stop building ${name}` : `Build ${name}`}
                        title={
                            armed
                                ? `Building a ${name}: pick a spot (all 7 hexes must be yours). Click again or Esc to stop.`
                                : `Build a ${name} (${counts.get(type)} left)`
                        }
                        on={armed}
                        badge={String(counts.get(type))}
                        onClick={() => onBuild(type)}
                    >
                        <ItemIcon kind="structure" id={type} size={38} teamColor={player.color} />
                    </Slot>
                );
            })}
            {upgrades.length > 0 && <Heading>Upgrades</Heading>}
            {upgrades.map((id) => {
                const level = upgradeLevel(player, id);
                const label = upgradeLabel(id, level);
                const effect = upgradeEffect(id, level);
                const badge = UPGRADES[id].maxLevel > 1 ? String(level) : undefined;
                if (!UPGRADES[id].slot) {
                    // Armor: always on, nothing to switch.
                    return (
                        <Slot key={id} label={label} title={`${label}: ${effect}`} on badge={badge}>
                            <ItemIcon kind="upgrade" id={id} />
                        </Slot>
                    );
                }
                const equipped = player.equippedUpgrade === id;
                let title = `Switch to ${label}: ${effect}`;
                if (equipped) title = `${label} (in use): ${effect}`;
                else if (wingsStuck)
                    title = "You can't take the Jetpack off over a mountain or deep water.";
                return (
                    <Slot
                        key={id}
                        label={equipped ? `${label}, in use` : `Switch to ${label}`}
                        title={title}
                        on={equipped}
                        disabled={equipped || wingsStuck}
                        badge={badge}
                        onClick={() => onEquip(id)}
                    >
                        <ItemIcon kind="upgrade" id={id} />
                    </Slot>
                );
            })}
        </div>
    );
}

function Heading({ children }: { children: ReactNode }) {
    return (
        <div
            style={{
                marginTop: 4,
                padding: '1px 6px',
                borderRadius: 4,
                background: 'rgba(0, 0, 0, 0.45)',
                color: 'rgba(255, 255, 255, 0.8)',
                fontSize: 10,
                letterSpacing: 1,
                textTransform: 'uppercase',
            }}
        >
            {children}
        </div>
    );
}

interface SlotProps {
    label: string;
    title: string;
    on?: boolean;
    badge?: string;
    /** Omitted for a display-only slot (Armor), which is always disabled. */
    onClick?: () => void;
    disabled?: boolean;
    children: ReactNode;
}

function Slot({ label, title, on = false, badge, onClick, disabled, children }: SlotProps) {
    return (
        <button
            type="button"
            tabIndex={-1}
            className={on ? 'invbar-slot invbar-slot--on' : 'invbar-slot'}
            aria-label={label}
            aria-pressed={onClick ? on : undefined}
            title={title}
            disabled={disabled ?? !onClick}
            onClick={(e) => {
                e.currentTarget.blur(); // so Space keeps meaning "shoot"
                onClick?.();
            }}
        >
            {children}
            {badge && <span className="invbar-badge">{badge}</span>}
        </button>
    );
}
