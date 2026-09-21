import { useEffect, useState } from 'react';

interface DebugStatsProps {
    /** Returns the render loop's smoothed frames per second (Phaser's `game.loop.actualFps`). */
    getFps: () => number;
}

/** Small FPS readout at the bottom center; GameScreen toggles it with the backtick (`) key. */
export function DebugStats({ getFps }: DebugStatsProps) {
    const [fps, setFps] = useState(0);

    useEffect(() => {
        const interval = window.setInterval(() => setFps(getFps()), 500);
        return () => window.clearInterval(interval);
    }, [getFps]);

    return (
        <div
            style={{
                position: 'absolute',
                left: '50%',
                transform: 'translateX(-50%)',
                bottom: 12,
                padding: '4px 8px',
                borderRadius: 6,
                background: 'rgba(0, 0, 0, 0.6)',
                color: fps >= 50 ? '#7CFC9A' : fps >= 30 ? '#FFD666' : '#FF7A7A',
                fontFamily: 'monospace',
                fontSize: 13,
                pointerEvents: 'none',
            }}
        >
            {Math.round(fps)} fps
        </div>
    );
}
