import type { PlayerState } from '../types/gameState';
import type { GamePhase } from '../types/shared';
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
                    <div>Health: {Math.max(0, Math.round(me.health))}</div>
                    <div>Ammo: {me.ammo}</div>
                    <div>Tiles: {me.tilesOwned}</div>
                    <div>Credits: {me.credits}</div>
                </>
            )}
        </div>
    );
}
