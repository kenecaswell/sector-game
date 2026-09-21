interface ScoreBadgeProps {
    score: number;
}

/** Always-visible score for the local player, top center of the game view. */
export function ScoreBadge({ score }: ScoreBadgeProps) {
    return (
        <div
            style={{
                position: 'absolute',
                top: 12,
                left: '50%',
                transform: 'translateX(-50%)',
                padding: '6px 20px',
                borderRadius: 999,
                background: 'rgba(0, 0, 0, 0.55)',
                color: '#fff',
                fontFamily: 'sans-serif',
                textAlign: 'center',
                lineHeight: 1.1,
                pointerEvents: 'none',
            }}
        >
            <div style={{ fontSize: 11, letterSpacing: 1.5, opacity: 0.75 }}>SCORE</div>
            <div style={{ fontSize: 26, fontWeight: 'bold' }}>{score}</div>
        </div>
    );
}
