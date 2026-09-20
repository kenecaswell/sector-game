import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  connectToGame,
  getStateCallbacks,
  isNormalClose,
  leaveGame,
  sendInput,
  sendPlaceStructure,
  sendShoot,
  sendStartGame,
  type GameRoom,
} from '../net/GameConnection';
import type { GameOverEvent, GamePhase } from '../types/shared';
import type { PlayerState } from '../types/gameState';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

const RECONNECT_RETRY_MS = 1500;

interface GameContextValue {
  status: ConnectionStatus;
  error: string | null;
  room: GameRoom | null;
  sessionId: string | null;
  phase: GamePhase;
  phaseEndsAt: number;
  players: PlayerState[];
  gameOver: GameOverEvent | null;
  connect: () => void;
  leave: () => void;
  input: (dir: { x: number; y: number }) => void;
  shoot: (angle: number) => void;
  placeStructure: (tileX: number, tileY: number) => void;
  startGame: () => void;
}

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [phase, setPhase] = useState<GamePhase>('lobby');
  const [phaseEndsAt, setPhaseEndsAt] = useState(0);
  const [players, setPlayers] = useState<PlayerState[]>([]);
  const [gameOver, setGameOver] = useState<GameOverEvent | null>(null);

  const roomRef = useRef<GameRoom | null>(null);
  const connectingRef = useRef(false);
  const leavingRef = useRef(false);
  const retryTimeoutRef = useRef<number | undefined>(undefined);
  const seqRef = useRef(0);
  // Populated right after `connect` is created below, so the onLeave handler
  // (set up inside connect, for reconnect retries) can call the latest
  // version of it without referencing the `connect` binding before it exists.
  const connectRef = useRef<() => void>(() => {});

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  const clearRetryTimeout = () => {
    if (retryTimeoutRef.current !== undefined) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = undefined;
    }
  };

  const connect = useCallback(() => {
    if (connectingRef.current || roomRef.current) return;
    connectingRef.current = true;
    leavingRef.current = false;
    setStatus((prev) => (prev === 'reconnecting' ? prev : 'connecting'));
    setError(null);

    connectToGame({
      onPhaseChanged: (event) => {
        setPhase(event.phase);
        setPhaseEndsAt(event.endsAt);
      },
      onGameOver: (event) => setGameOver(event),
    })
      .then((joinedRoom) => {
        setRoom(joinedRoom);
        setStatus('connected');
        setGameOver(null);
        setPhase(joinedRoom.state.phase.phase);
        setPhaseEndsAt(joinedRoom.state.phase.endsAt);

        const $ = getStateCallbacks(joinedRoom);
        const syncPlayers = () => setPlayers(Array.from(joinedRoom.state.players.values()));

        $(joinedRoom.state).players.onAdd((player) => {
          $(player).onChange(syncPlayers);
          syncPlayers();
        });
        $(joinedRoom.state).players.onRemove(syncPlayers);
        syncPlayers();

        joinedRoom.onLeave((code) => {
          setRoom(null);
          if (leavingRef.current || isNormalClose(code)) {
            setStatus('idle');
            return;
          }
          // Unexpected drop (network blip, server restart mid-session) —
          // keep retrying; connectToGame will use the saved reconnection
          // token automatically as long as one is still in sessionStorage.
          setStatus('reconnecting');
          retryTimeoutRef.current = window.setTimeout(() => connectRef.current(), RECONNECT_RETRY_MS);
        });
      })
      .catch((err: unknown) => {
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Failed to connect to the game server');
      })
      .finally(() => {
        connectingRef.current = false;
      });
  }, []);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const leave = useCallback(() => {
    clearRetryTimeout();
    leavingRef.current = true;
    if (roomRef.current) void leaveGame(roomRef.current);
    setRoom(null);
    setStatus('idle');
  }, []);

  useEffect(() => {
    return () => {
      clearRetryTimeout();
      leavingRef.current = true;
      if (roomRef.current) void leaveGame(roomRef.current);
    };
  }, []);

  const input = useCallback(
    (dir: { x: number; y: number }) => {
      if (!room) return;
      sendInput(room, dir, ++seqRef.current);
    },
    [room]
  );

  const shoot = useCallback(
    (angle: number) => {
      if (!room) return;
      sendShoot(room, angle, ++seqRef.current);
    },
    [room]
  );

  const placeStructure = useCallback(
    (tileX: number, tileY: number) => {
      if (!room) return;
      sendPlaceStructure(room, tileX, tileY, ++seqRef.current);
    },
    [room]
  );

  const startGame = useCallback(() => {
    if (!room) return;
    sendStartGame(room);
  }, [room]);

  const value = useMemo<GameContextValue>(
    () => ({
      status,
      error,
      room,
      sessionId: room?.sessionId ?? null,
      phase,
      phaseEndsAt,
      players,
      gameOver,
      connect,
      leave,
      input,
      shoot,
      placeStructure,
      startGame,
    }),
    [status, error, room, phase, phaseEndsAt, players, gameOver, connect, leave, input, shoot, placeStructure, startGame]
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

// hook is tightly coupled to GameProvider/GameContext and belongs in the same file
// eslint-disable-next-line react-refresh/only-export-components
export function useGameConnection(): GameContextValue {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGameConnection must be used within a GameProvider');
  return ctx;
}
