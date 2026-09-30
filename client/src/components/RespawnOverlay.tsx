import { usePhaseCountdown } from '../utils/usePhaseCountdown';

interface RespawnOverlayProps {
    respawnAt: number; // server time (ms) you respawn at; 0 = you're in play (nothing is shown)
    hasBackpack: boolean; // you have gear lying in a backpack
}

/**
 * While you're down: "Defeated", the seconds until you respawn at your spawn spot, and, if you
 * dropped anything, where your weapons and upgrades went. Centered over the game view; clicks pass
 * through (menus still work while you wait).
 */
export function RespawnOverlay({ respawnAt, hasBackpack }: RespawnOverlayProps) {
    const seconds = usePhaseCountdown(respawnAt, 100);
    if (seconds === null) return null;
    return (
        <div
            role="status"
            style={{
                position: 'absolute',
                top: '38%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                maxWidth: 'calc(100% - 32px)',
                padding: '16px 24px',
                borderRadius: 12,
                background: 'rgba(0, 0, 0, 0.65)',
                color: '#fff',
                fontFamily: 'sans-serif',
                textAlign: 'center',
                pointerEvents: 'none',
            }}
        >
            <div style={{ fontSize: 26, fontWeight: 'bold', color: '#e74c3c' }}>Defeated</div>
            <div style={{ fontSize: 18, marginTop: 4 }}>Respawning in {Math.max(1, seconds)}…</div>
            {hasBackpack && (
                <div style={{ fontSize: 14, marginTop: 8, opacity: 0.85, lineHeight: 1.4 }}>
                    Your weapons and upgrades are in a backpack where you fell.
                    <br />
                    Only you can see it: walk onto it to get them back.
                </div>
            )}
        </div>
    );
}
