import type { PlayerState } from '../types/gameState';
import type { GamePhase, GunId, UpgradeId } from '../types/shared';
import { GUN_NAMES, STRUCTURE_NAMES, UPGRADE_NAMES, isStructureType } from '../types/shared';
import { usePhaseCountdown } from '../utils/usePhaseCountdown';

interface HUDProps {
    me: PlayerState | undefined;
    phase: GamePhase;
    phaseEndsAt: number;
}

export function HUD({ me, phase, phaseEndsAt }: HUDProps) {
    const secondsLeft = usePhaseCountdown(phaseEndsAt);

    return (
        <div
            style={{
                position: 'absolute',
                top: 12,
                left: 12,
                padding: '8px 12px',
                borderRadius: 8,
                background: 'rgba(0, 0, 0, 0.55)',
                color: '#fff',
                fontFamily: 'sans-serif',
                fontSize: 14,
                lineHeight: 1.5,
                textAlign: 'left',
                pointerEvents: 'none',
            }}
        >
            <div style={{ textTransform: 'capitalize' }}>
                {phase}
                {secondsLeft !== null && ` — ${secondsLeft}s`}
            </div>
            {me && (
                <>
                    <div>
                        Health: {Math.max(0, Math.round(me.health))} / {me.maxHealth}
                    </div>
                    <div>Gun: {GUN_NAMES[me.gun as GunId] ?? 'none'}</div>
                    <div>Ammo: {me.ammo}</div>
                    <div>Tiles: {me.tilesOwned}</div>
                    <div>Credits: {me.credits}</div>
                    <div>Structures: {structureSummary(me.structureInventory)}</div>
                    {me.upgrades.length > 0 && (
                        <div>
                            Upgrades:{' '}
                            {me.upgrades
                                .map((id) => UPGRADE_NAMES[id as UpgradeId] ?? id)
                                .join(', ')}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

/** e.g. "Farm, Fort ×2", or "none". */
function structureSummary(inventory: readonly string[]): string {
    const counts = new Map<string, number>();
    inventory.forEach((type) => counts.set(type, (counts.get(type) ?? 0) + 1));
    if (counts.size === 0) return 'none';
    return Array.from(counts, ([type, count]) => {
        const name = isStructureType(type) ? STRUCTURE_NAMES[type] : type;
        return count > 1 ? `${name} ×${count}` : name;
    }).join(', ');
}
