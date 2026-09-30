import { useCallback, useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { useGameConnection } from '../context/GameContext';
import { createPhaserGame, destroyPhaserGame } from '../game/PhaserGame';
import { sendDevMaterials } from '../net/GameConnection';
import type { GameScene } from '../game/scenes/GameScene';
import { FabricatorMenu } from '../components/FabricatorMenu';
import { InventoryBar } from '../components/InventoryBar';
import { hexIndex, isValidHex, pixelToHex } from '../game/hex';
import { blocksWalking } from '../game/terrain';
import { HUD } from '../components/HUD';
import { NoticeStack } from '../components/NoticeStack';
import { Leaderboard } from '../components/Leaderboard';
import { MobileJoystick } from '../components/MobileJoystick';
import { DebugStats } from '../components/DebugStats';
import { FireButton } from '../components/FireButton';
import { ScoreBadge } from '../components/ScoreBadge';
import { RespawnOverlay } from '../components/RespawnOverlay';
import { STRUCTURE_NAMES, type StructureType } from '../types/shared';
import { cycleStructure, structureToBuild } from '../utils/build';
import { isTouchDevice } from '../utils/device';
import { scoreFor } from '../utils/score';

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
        equipUpgrade,
    } = useGameConnection();
    const containerRef = useRef<HTMLDivElement>(null);
    const gameRef = useRef<Phaser.Game | null>(null);
    const [buildModeArmed, setBuildModeArmed] = useState(false);
    // The structure picked (an inventory-bar icon, or Tab in build mode) for Build to place next (see utils/build.ts). A ref too,
    // for the Phaser callback below, which outlives renders.
    const [selectedStructure, setSelectedStructure] = useState<StructureType>();
    const selectedStructureRef = useRef<StructureType>(undefined);
    useEffect(() => {
        selectedStructureRef.current = selectedStructure;
    }, [selectedStructure]);
    // Only one popup is open at a time.
    const [panel, setPanel] = useState<'none' | 'leaderboard' | 'fabricator'>('none');
    // The inventory bar on the right; I hides and shows it.
    const [showInventoryBar, setShowInventoryBar] = useState(true);
    const [showStats, setShowStats] = useState(false);
    const touch = isTouchDevice();
    const shopAvailable = phase === 'playing';

    useEffect(() => {
        if (!room || !sessionId || !containerRef.current) return;

        const game = createPhaserGame(containerRef.current, room, sessionId, {
            onInput: input,
            onShoot: shoot,
            onPlaceStructure: (tileX, tileY) => {
                // Build the picked structure, or the first in the inventory (read live: this closure
                // outlives renders).
                const next = structureToBuild(
                    room.state.players.get(sessionId)?.structureInventory,
                    selectedStructureRef.current
                );
                if (next) placeStructure(tileX, tileY, next);
                setBuildModeArmed(false);
            },
        });
        gameRef.current = game;

        return () => {
            destroyPhaserGame(game);
            gameRef.current = null;
        };
        // Intentionally only re-creates the Phaser game if the room/session
        // change (e.g. reconnect into a new room) — input/shoot/placeStructure
        // are stable across a given room's lifetime.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [room, sessionId]);

    const getGame = useCallback(() => gameRef.current, []);

    // Read live from the room (positions don't re-render React): is the player over a mountain or
    // deep water right now? The server won't take Wings off there, so the inventory says so.
    const overSolidTerrain = useCallback(() => {
        if (!room || !sessionId) return false;
        const self = room.state.players.get(sessionId);
        if (!self) return false;
        const { mapWidth, mapHeight, tiles } = room.state;
        const { col, row } = pixelToHex(self.x, self.y);
        return blocksWalking(
            (c, r) =>
                isValidHex(c, r, mapWidth, mapHeight)
                    ? tiles[hexIndex(c, r, mapWidth)]?.terrain
                    : undefined,
            col,
            row
        );
    }, [room, sessionId]);

    const getScene = (): GameScene | undefined =>
        gameRef.current?.scene.getScene('GameScene') as GameScene | undefined;

    const me = players.find((player) => player.id === sessionId);
    const nextStructure = structureToBuild(me?.structureInventory, selectedStructure);
    const canBuild = nextStructure !== undefined;
    const hasGun = !!me?.gun;
    // Build mode only counts while there's something left to build.
    const buildArmed = buildModeArmed && canBuild;

    // The scene follows this state, so leaving build mode (Esc, B) or running out of structures puts
    // the next tap back to shooting.
    useEffect(() => {
        const scene = gameRef.current?.scene.getScene('GameScene') as GameScene | undefined;
        scene?.setBuildMode(buildArmed);
    }, [buildArmed]);

    // Build mode stays on until you build, press B again, or press Esc (no timeout).
    const toggleBuildMode = useCallback(() => {
        if (canBuild) setBuildModeArmed(!buildArmed);
    }, [canBuild, buildArmed]);

    // A structure icon on the HUD: build that type, or stop if it's the one already armed.
    const buildFromBar = (type: StructureType) => {
        if (buildArmed && nextStructure === type) {
            setBuildModeArmed(false);
            return;
        }
        setSelectedStructure(type);
        setBuildModeArmed(true);
    };

    // B toggles build mode (with the structure picked last, or the first you have); in build mode
    // Tab picks the next structure type you hold (Shift+Tab the previous). F toggles the
    // Fabricator, L the leaderboard, I shows/hides the inventory bar; Esc leaves build mode and
    // closes any popup; ` toggles the FPS readout. E is unbound (it opened the Shop until
    // 2026-09-27; kept free for later). Phaser only captures the keys it registers (WASD, arrows,
    // Space), so these don't conflict. DEV ONLY (temporary): M adds 500 materials, in dev builds
    // (`npm run dev`) only; the server refuses it when run with NODE_ENV=production.
    const inventory = me?.structureInventory;
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Tab') {
                if (!buildArmed) return; // otherwise leave Tab alone
                event.preventDefault(); // don't move the browser's focus
                const next = cycleStructure(inventory, nextStructure, event.shiftKey ? -1 : 1);
                if (next) setSelectedStructure(next);
                return;
            }
            if (event.repeat) return;
            const key = event.key.toLowerCase();
            if (key === 'l') {
                setPanel((open) => (open === 'leaderboard' ? 'none' : 'leaderboard'));
            } else if (key === 'f' && shopAvailable) {
                setPanel((open) => (open === 'fabricator' ? 'none' : 'fabricator'));
            } else if (key === 'i') {
                setShowInventoryBar((show) => !show);
            } else if (key === 'm' && phase === 'playing' && import.meta.env.DEV && room) {
                sendDevMaterials(room);
            } else if (key === 'b' && phase === 'playing') {
                toggleBuildMode();
            } else if (key === 'escape') {
                setPanel('none');
                setBuildModeArmed(false);
            } else if (key === '`') setShowStats((show) => !show);
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [shopAvailable, phase, toggleBuildMode, room, buildArmed, inventory, nextStructure]);

    return (
        // Fixed to the viewport, outside the page's normal flow. (Sizing this 100vw x 100vh inside the
        // Vite template's #root made the page scroll and clipped the right-hand overlays.)
        <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
            <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

            <HUD me={me} phase={phase} phaseEndsAt={phaseEndsAt} />
            <NoticeStack notices={notices} />
            <ScoreBadge score={me ? scoreFor(me) : 0} />
            <RespawnOverlay
                respawnAt={me?.respawnAt ?? 0}
                // Only your own backpacks are ever sent to you. Read live: the overlay re-renders
                // on its own countdown, and the backpack arrives on the tick you fall.
                hasBackpack={(room?.state.backpacks?.size ?? 0) > 0}
            />

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
                    label="Fabricator"
                    top={56}
                    active={panel === 'fabricator'}
                    onClick={() =>
                        setPanel((open) => (open === 'fabricator' ? 'none' : 'fabricator'))
                    }
                />
            )}
            {panel === 'leaderboard' && (
                <Leaderboard
                    players={players}
                    sessionId={sessionId}
                    onClose={() => setPanel('none')}
                />
            )}
            {panel === 'fabricator' && shopAvailable && (
                <FabricatorMenu
                    player={me}
                    onFabricate={purchase}
                    onClose={() => setPanel('none')}
                />
            )}
            {phase === 'playing' && showInventoryBar && (
                <InventoryBar
                    player={me}
                    building={buildArmed ? nextStructure : undefined}
                    onBuild={buildFromBar}
                    onEquip={equipUpgrade}
                    overSolidTerrain={overSolidTerrain}
                />
            )}
            {buildArmed && (
                <div
                    role="status"
                    style={{
                        position: 'absolute',
                        // On touch the joystick and fire button hold the bottom corners.
                        bottom: touch ? 24 + 76 + 12 : 24,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        maxWidth: 'calc(100% - 32px)',
                        padding: '8px 14px',
                        borderRadius: 8,
                        background: '#f1c40f',
                        color: '#000',
                        fontFamily: 'sans-serif',
                        fontSize: 14,
                        fontWeight: 'bold',
                        textAlign: 'center',
                        pointerEvents: 'none', // taps go through to the map
                    }}
                >
                    Pick a spot for the {STRUCTURE_NAMES[nextStructure]} — all 7 hexes must be
                    yours.{' '}
                    {touch
                        ? 'Tap its icon again to cancel.'
                        : 'Tab for another structure, Esc to cancel.'}
                </div>
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
