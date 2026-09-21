import { useCallback, useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { useGameConnection } from '../context/GameContext';
import { createPhaserGame } from '../game/PhaserGame';
import type { GameScene } from '../game/scenes/GameScene';
import { BuyMenu } from '../components/BuyMenu';
import { HUD } from '../components/HUD';
import { Leaderboard } from '../components/Leaderboard';
import { MobileJoystick } from '../components/MobileJoystick';
import { DebugStats } from '../components/DebugStats';
import { FireButton } from '../components/FireButton';
import { ScoreBadge } from '../components/ScoreBadge';
import { isTouchDevice } from '../utils/device';
import { scoreFor } from '../utils/score';

const BUILD_MODE_ARMED_MS = 5000;

export function GameScreen() {
    const {
        room,
        sessionId,
        phase,
        phaseEndsAt,
        players,
        input,
        shoot,
        placeStructure,
        endBuying,
    } = useGameConnection();
    const containerRef = useRef<HTMLDivElement>(null);
    const gameRef = useRef<Phaser.Game | null>(null);
    const [buildModeArmed, setBuildModeArmed] = useState(false);
    // Only one popup is open at a time.
    // GameScreen mounts right as the buying phase starts, so it has to start with the shop open.
    const [panel, setPanel] = useState<'none' | 'leaderboard' | 'shop'>(
        phase === 'buying' ? 'shop' : 'none'
    );
    const [previousPhase, setPreviousPhase] = useState(phase);
    const [showStats, setShowStats] = useState(false);
    const touch = isTouchDevice();

    // The shop opens by itself when the buying phase starts and closes when play begins
    // (players can reopen it). Adjusting state during render on a change is React's
    // recommended alternative to setting state in an effect.
    if (phase !== previousPhase) {
        setPreviousPhase(phase);
        if (phase === 'buying') setPanel('shop');
        else if (phase === 'playing' && panel === 'shop') setPanel('none');
    }
    const shopAvailable = phase === 'buying' || phase === 'playing';

    // TEMPORARY testing shortcut: closing the shop during the buying phase starts the match, so a
    // solo tester doesn't have to wait out the 30s. (Host only — the server ignores anyone else.)
    // Remove once the buy menu is real.
    const previousPanel = useRef(panel);
    useEffect(() => {
        if (previousPanel.current === 'shop' && panel === 'none' && phase === 'buying') endBuying();
        previousPanel.current = panel;
    }, [panel, phase, endBuying]);

    useEffect(() => {
        if (!room || !sessionId || !containerRef.current) return;

        const game = createPhaserGame(containerRef.current, room, sessionId, {
            onInput: input,
            onShoot: shoot,
            onPlaceStructure: (tileX, tileY) => {
                placeStructure(tileX, tileY);
                setBuildModeArmed(false);
            },
        });
        gameRef.current = game;

        return () => {
            game.destroy(true);
            gameRef.current = null;
        };
        // Intentionally only re-creates the Phaser game if the room/session
        // change (e.g. reconnect into a new room) — input/shoot/placeStructure
        // are stable across a given room's lifetime.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [room, sessionId]);

    useEffect(() => {
        if (!buildModeArmed) return;
        const timeout = window.setTimeout(() => setBuildModeArmed(false), BUILD_MODE_ARMED_MS);
        return () => window.clearTimeout(timeout);
    }, [buildModeArmed]);

    // L toggles the leaderboard, B the shop, Esc closes either, ` toggles the FPS readout. Phaser only
    // captures the keys it registers (WASD, arrows, Space), so these don't conflict.
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.repeat) return;
            if (event.key === 'l' || event.key === 'L') {
                setPanel((open) => (open === 'leaderboard' ? 'none' : 'leaderboard'));
            } else if (event.key === 'b' || event.key === 'B') {
                setPanel((open) => (open === 'shop' ? 'none' : 'shop'));
            } else if (event.key === 'Escape') setPanel('none');
            else if (event.key === '`') setShowStats((show) => !show);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    const getFps = useCallback(() => gameRef.current?.loop.actualFps ?? 0, []);

    const getScene = (): GameScene | undefined =>
        gameRef.current?.scene.getScene('GameScene') as GameScene | undefined;

    const toggleBuildMode = () => {
        const next = !buildModeArmed;
        setBuildModeArmed(next);
        getScene()?.setBuildMode(next);
    };

    const me = players.find((player) => player.id === sessionId);

    return (
        // Fixed to the viewport, outside the page's normal flow. (Sizing this 100vw x 100vh inside the
        // Vite template's #root made the page scroll and clipped the right-hand overlays.)
        <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
            <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

            <HUD me={me} phase={phase} phaseEndsAt={phaseEndsAt} />
            <ScoreBadge score={me ? scoreFor(me) : 0} />

            <TopButton
                label="Leaderboard"
                top={12}
                active={panel === 'leaderboard'}
                onClick={() =>
                    setPanel((open) => (open === 'leaderboard' ? 'none' : 'leaderboard'))
                }
            />
            {shopAvailable && (
                <TopButton
                    label="Shop"
                    top={56}
                    active={panel === 'shop'}
                    onClick={() => setPanel((open) => (open === 'shop' ? 'none' : 'shop'))}
                />
            )}
            {panel === 'leaderboard' && (
                <Leaderboard
                    players={players}
                    sessionId={sessionId}
                    onClose={() => setPanel('none')}
                />
            )}
            {panel === 'shop' && shopAvailable && (
                <BuyMenu
                    credits={me?.credits ?? 0}
                    phase={phase}
                    phaseEndsAt={phaseEndsAt}
                    onClose={() => setPanel('none')}
                />
            )}

            {phase === 'playing' && (
                <button
                    type="button"
                    tabIndex={-1}
                    onClick={(e) => {
                        e.currentTarget.blur(); // so Space keeps meaning "shoot"
                        toggleBuildMode();
                    }}
                    style={{
                        position: 'absolute',
                        // On touch the fire button sits in the corner; stack Build above it.
                        bottom: touch ? 24 + 76 + 12 : 24,
                        right: 24,
                        padding: '10px 16px',
                        borderRadius: 8,
                        border: 'none',
                        background: buildModeArmed ? '#f1c40f' : 'rgba(255, 255, 255, 0.85)',
                        fontWeight: 'bold',
                    }}
                >
                    {buildModeArmed ? 'Tap a tile to build…' : 'Build'}
                </button>
            )}

            {showStats && <DebugStats getFps={getFps} />}
            {touch && <MobileJoystick onChange={(dir) => getScene()?.setJoystick(dir)} />}
            {touch && phase === 'playing' && (
                <FireButton onHoldChange={(held) => getScene()?.setFireHeld(held)} />
            )}
        </div>
    );
}

interface TopButtonProps {
    label: string;
    top: number;
    active: boolean;
    onClick: () => void;
}

/** A small button at the top-right that toggles a popup. */
function TopButton({ label, top, active, onClick }: TopButtonProps) {
    return (
        <button
            type="button"
            tabIndex={-1}
            aria-expanded={active}
            onClick={(e) => {
                e.currentTarget.blur(); // so Space keeps meaning "shoot", not "press this button"
                onClick();
            }}
            style={{
                position: 'absolute',
                top,
                right: 12,
                padding: '8px 12px',
                borderRadius: 8,
                border: 'none',
                background: active ? '#f1c40f' : 'rgba(0, 0, 0, 0.55)',
                color: active ? '#000' : '#fff',
                fontFamily: 'sans-serif',
                fontSize: 14,
            }}
        >
            {label}
        </button>
    );
}
