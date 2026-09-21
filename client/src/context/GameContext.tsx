import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import type { ReactNode } from 'react';
import {
    connectToGame,
    getStateCallbacks,
    isNormalClose,
    leaveGame,
    sendInput,
    sendEndBuying,
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
    // Kept after the room closes so the results screen can still say who "you" were.
    lastSessionId: string | null;
    phase: GamePhase;
    phaseEndsAt: number;
    players: PlayerState[];
    gameOver: GameOverEvent | null;
    connect: () => void;
    leave: () => void;
    input: (dir: { x: number; y: number }, angle?: number) => void;
    shoot: (angle: number) => void;
    placeStructure: (tileX: number, tileY: number) => void;
    startGame: () => void;
    endBuying: () => void;
    // Leave the finished match and join a fresh lobby / just go back to the start screen.
    playAgain: () => void;
    exitResults: () => void;
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
    const [lastSessionId, setLastSessionId] = useState<string | null>(null);

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
            .then(async (joinedRoom) => {
                // The join handshake resolves before the server's initial full-state
                // message has been decoded, so `state.phase` is undefined until the
                // first state change fires. Wait for it so nothing downstream sees a
                // half-populated state.
                if (!joinedRoom.state?.phase) {
                    await new Promise<void>((resolve) =>
                        joinedRoom.onStateChange.once(() => resolve())
                    );
                }

                roomRef.current = joinedRoom;
                setRoom(joinedRoom);
                setLastSessionId(joinedRoom.sessionId);
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
                    // Ignore rooms we already walked away from (e.g. "play again" leaves the old room and
                    // connects to a new one before the old room's close event arrives).
                    if (roomRef.current !== joinedRoom) return;
                    roomRef.current = null;
                    setRoom(null);
                    if (leavingRef.current || isNormalClose(code)) {
                        setStatus('idle');
                        return;
                    }
                    // Unexpected drop (network blip, server restart mid-session) —
                    // keep retrying; connectToGame will use the saved reconnection
                    // token automatically as long as one is still in sessionStorage.
                    setStatus('reconnecting');
                    retryTimeoutRef.current = window.setTimeout(
                        () => connectRef.current(),
                        RECONNECT_RETRY_MS
                    );
                });
            })
            .catch((err: unknown) => {
                setStatus('error');
                setError(
                    err instanceof Error ? err.message : 'Failed to connect to the game server'
                );
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
        const current = roomRef.current;
        roomRef.current = null;
        if (current) leaveGame(current).catch(() => undefined); // may already be closed
        setRoom(null);
        setStatus('idle');
    }, []);

    const exitResults = useCallback(() => {
        leave();
        setGameOver(null);
    }, [leave]);

    const playAgain = useCallback(() => {
        leave();
        setGameOver(null);
        connect();
    }, [leave, connect]);

    useEffect(() => {
        return () => {
            clearRetryTimeout();
            leavingRef.current = true;
            if (roomRef.current) void leaveGame(roomRef.current);
        };
    }, []);

    const input = useCallback(
        (dir: { x: number; y: number }, angle?: number) => {
            if (!room) return;
            sendInput(room, dir, ++seqRef.current, angle);
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

    const endBuying = useCallback(() => {
        if (!room) return;
        sendEndBuying(room);
    }, [room]);

    const value = useMemo<GameContextValue>(
        () => ({
            status,
            error,
            room,
            sessionId: room?.sessionId ?? null,
            lastSessionId,
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
            endBuying,
            playAgain,
            exitResults,
        }),
        [
            status,
            error,
            room,
            lastSessionId,
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
            endBuying,
            playAgain,
            exitResults,
        ]
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
