import { useCallback, useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { useGameConnection } from '../context/GameContext';
import { createPhaserGame } from '../game/PhaserGame';
import type { GameScene } from '../game/scenes/GameScene';
import { BuyMenu } from '../components/BuyMenu';
import { HUD } from '../components/HUD';
import { NoticeStack } from '../components/NoticeStack';
import { Leaderboard } from '../components/Leaderboard';
import { MobileJoystick } from '../components/MobileJoystick';
import { DebugStats } from '../components/DebugStats';
import { FireButton } from '../components/FireButton';
import { ScoreBadge } from '../components/ScoreBadge';
import { BASE_CLAIM_RADIUS } from '../game/constants';
import { STRUCTURE_NAMES, isStructureType } from '../types/shared';
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
        notices,
        input,
        shoot,
        placeStructure,
        purchase,
    } = useGameConnection();
    const containerRef = useRef<HTMLDivElement>(null);
    const gameRef = useRef<Phaser.Game | null>(null);
    const [buildModeArmed, setBuildModeArmed] = useState(false);
    // Only one popup is open at a time.
    const [panel, setPanel] = useState<'none' | 'leaderboard' | 'shop'>('none');
    const [showStats, setShowStats] = useState(false);
    const touch = isTouchDevice();
    const shopAvailable = phase === 'playing';

    useEffect(() => {
        if (!room || !sessionId || !containerRef.current) return;

        const game = createPhaserGame(containerRef.current, room, sessionId, {
            onInput: input,
            onShoot: shoot,
            onPlaceStructure: (tileX, tileY) => {
                // Build the next structure in the inventory (read live: this closure outlives renders).
                const next = room.state.players.get(sessionId)?.structureInventory[0];
                if (isStructureType(next)) placeStructure(tileX, tileY, next);
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

    const getGame = useCallback(() => gameRef.current, []);

    const getScene = (): GameScene | undefined =>
        gameRef.current?.scene.getScene('GameScene') as GameScene | undefined;

    const me = players.find((player) => player.id === sessionId);
    const nextStructure = me?.structureInventory[0];
    const canBuild = isStructureType(nextStructure);
    const hasGun = !!me?.gun;
    // Build mode only counts while there's something left to build.
    const buildArmed = buildModeArmed && canBuild;

    // The scene follows this state, so the timeout above and running out of structures both put the
    // next tap back to shooting.
    useEffect(() => {
        const scene = gameRef.current?.scene.getScene('GameScene') as GameScene | undefined;
        scene?.setBuildMode(buildArmed);
    }, [buildArmed]);

    const toggleBuildMode = () => {
        if (canBuild) setBuildModeArmed(!buildArmed);
    };

    return (
        // Fixed to the viewport, outside the page's normal flow. (Sizing this 100vw x 100vh inside the
        // Vite template's #root made the page scroll and clipped the right-hand overlays.)
        <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
            <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

            <HUD me={me} phase={phase} phaseEndsAt={phaseEndsAt} />
            <NoticeStack notices={notices} />
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
                    ammo={me?.ammo ?? 0}
                    hasExpander={(me?.claimRadius ?? 0) > BASE_CLAIM_RADIUS + 0.5}
                    hasGun={!!me?.gun}
                    onBuy={purchase}
                    onClose={() => setPanel('none')}
                />
            )}

            {phase === 'playing' && (
                <button
                    type="button"
                    tabIndex={-1}
                    disabled={!canBuild}
                    title={canBuild ? undefined : 'No structures left to build'}
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
                        background: buildArmed ? '#f1c40f' : 'rgba(255, 255, 255, 0.85)',
                        opacity: canBuild ? 1 : 0.5,
                        fontWeight: 'bold',
                    }}
                >
                    {buildArmed
                        ? 'Tap one of your tiles to build…'
                        : canBuild
                          ? `Build ${STRUCTURE_NAMES[nextStructure]} (${me?.structureInventory.length})`
                          : 'Nothing to build'}
                </button>
            )}

            {showStats && <DebugStats getGame={getGame} />}
            {touch && <MobileJoystick onChange={(dir) => getScene()?.setJoystick(dir)} />}
            {touch && phase === 'playing' && hasGun && (
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
