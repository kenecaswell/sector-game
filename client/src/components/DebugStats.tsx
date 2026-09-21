import { useEffect, useState } from 'react';
import Phaser from 'phaser';

interface DebugStatsProps {
    /** The running Phaser game (null before it exists). */
    getGame: () => Phaser.Game | null;
}

interface Stats {
    fps: number;
    frameMs: number;
    info: string;
}

/**
 * Small performance readout at the bottom center; GameScreen toggles it with the backtick (`) key.
 * Shows frames per second, the average JS time Phaser spent per frame (update + render — if this
 * is small but fps is low, the bottleneck is the GPU or other browser work, not our code), and
 * the renderer, canvas size and pixel ratio. It only listens to the game while it's on screen.
 */
export function DebugStats({ getGame }: DebugStatsProps) {
    const [stats, setStats] = useState<Stats>({ fps: 0, frameMs: 0, info: '' });

    useEffect(() => {
        const game = getGame();
        if (!game) return;

        let frameStart = 0;
        let totalMs = 0;
        let frames = 0;
        const onFrameStart = () => {
            frameStart = performance.now();
        };
        const onFrameEnd = () => {
            totalMs += performance.now() - frameStart;
            frames++;
        };
        game.events.on(Phaser.Core.Events.PRE_STEP, onFrameStart);
        game.events.on(Phaser.Core.Events.POST_RENDER, onFrameEnd);

        const interval = window.setInterval(() => {
            const renderer = game.renderer.type === Phaser.WEBGL ? 'WebGL' : 'Canvas';
            setStats({
                fps: game.loop.actualFps,
                frameMs: frames > 0 ? totalMs / frames : 0,
                info: `${renderer} ${game.scale.width}x${game.scale.height} @${window.devicePixelRatio}x`,
            });
            totalMs = 0;
            frames = 0;
        }, 500);

        return () => {
            window.clearInterval(interval);
            game.events.off(Phaser.Core.Events.PRE_STEP, onFrameStart);
            game.events.off(Phaser.Core.Events.POST_RENDER, onFrameEnd);
        };
    }, [getGame]);

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
                color: stats.fps >= 50 ? '#7CFC9A' : stats.fps >= 30 ? '#FFD666' : '#FF7A7A',
                fontFamily: 'monospace',
                fontSize: 13,
                textAlign: 'center',
                lineHeight: 1.3,
                pointerEvents: 'none',
            }}
        >
            <div>
                {Math.round(stats.fps)} fps · {stats.frameMs.toFixed(1)} ms/frame
            </div>
            <div style={{ fontSize: 11, opacity: 0.75 }}>{stats.info}</div>
        </div>
    );
}
