import { useEffect, useState } from 'react';
import type { PlayerState } from '../types/gameState';
import type { GamePhase } from '../types/shared';

interface HUDProps {
  me: PlayerState | undefined;
  phase: GamePhase;
  phaseEndsAt: number;
}

export function HUD({ me, phase, phaseEndsAt }: HUDProps) {
  // Date.now() is impure, so the countdown is computed in an effect (ticking
  // once a second) rather than read directly during render.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const secondsLeft = phaseEndsAt > 0 ? Math.max(0, Math.ceil((phaseEndsAt - now) / 1000)) : null;

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
