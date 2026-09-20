import { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { useGameConnection } from '../context/GameContext';
import { createPhaserGame } from '../game/PhaserGame';
import type { GameScene } from '../game/scenes/GameScene';
import { HUD } from '../components/HUD';
import { Leaderboard } from '../components/Leaderboard';
import { MobileJoystick } from '../components/MobileJoystick';
import { isTouchDevice } from '../utils/device';

const BUILD_MODE_ARMED_MS = 5000;

export function GameScreen() {
  const { room, sessionId, phase, phaseEndsAt, players, input, shoot, placeStructure } =
    useGameConnection();
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const [buildModeArmed, setBuildModeArmed] = useState(false);

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

  const getScene = (): GameScene | undefined =>
    gameRef.current?.scene.getScene('GameScene') as GameScene | undefined;

  const toggleBuildMode = () => {
    const next = !buildModeArmed;
    setBuildModeArmed(next);
    getScene()?.setBuildMode(next);
  };

  const me = players.find((player) => player.id === sessionId);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      <HUD me={me} phase={phase} phaseEndsAt={phaseEndsAt} />
      <Leaderboard players={players} sessionId={sessionId} />

      {phase === 'combat' && (
        <button
          type="button"
          onClick={toggleBuildMode}
          style={{
            position: 'absolute',
            bottom: 24,
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

      {isTouchDevice() && (
        <MobileJoystick
          onChange={(dir) => getScene()?.setJoystick(dir)}
        />
      )}
    </div>
  );
}
