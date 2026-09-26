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
    sendPlaceStructure,
    sendPurchase,
    sendSelectCharacter,
    sendSelectTeam,
    sendSetName,
    sendSetReady,
    sendShoot,
    type GameRoom,
} from '../net/GameConnection';
import type {
    CharacterId,
    GameOverEvent,
    GamePhase,
    PlayerDisconnectedEvent,
    PlayerReconnectedEvent,
    ShopItemId,
    StructureType,
    TeamId,
} from '../types/shared';
import type { PlayerState } from '../types/gameState';
import { normalizePlayerName } from '../types/shared';
import { loadPlayerName, savePlayerName } from '../utils/playerName';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

const RECONNECT_RETRY_MS = 1500;
// Keep retrying for about as long as the server holds a dropped player's seat (3 minutes).
const MAX_RECONNECT_ATTEMPTS = 120;
const NOTICE_MS = 6000;
const MAX_NOTICES = 4;

/** A short message shown to everyone in the match (e.g. a player disconnected). */
export interface Notice {
    id: number;
    kind: 'warning' | 'success';
    text: string;
}

interface GameContextValue {
    status: ConnectionStatus;
    error: string | null;
    room: GameRoom | null;
    sessionId: string | null;
    // Kept after the room closes so the results screen can still say who "you" were.
    lastSessionId: string | null;
    notices: Notice[];
    phase: GamePhase;
    phaseEndsAt: number;
    players: PlayerState[];
    gameOver: GameOverEvent | null;
    connect: () => void;
    leave: () => void;
    input: (dir: { x: number; y: number }, angle?: number) => void;
    shoot: (angle: number) => void;
    placeStructure: (tileX: number, tileY: number, structureType: StructureType) => void;
    selectTeam: (teamId: TeamId) => void;
    selectCharacter: (characterId: CharacterId) => void;
    setReady: (ready: boolean) => void;
    // Rename yourself (lobby only) and remember the name for next time. Ignored if invalid.
    setName: (name: string) => void;
    purchase: (itemId: ShopItemId) => void;
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
    const [notices, setNotices] = useState<Notice[]>([]);
    const noticeIdRef = useRef(0);
    const noticeTimersRef = useRef<number[]>([]);
    // True from an unexpected connection drop until we're back in a room (or gave up / left).
    const reconnectingRef = useRef(false);
    const reconnectAttemptsRef = useRef(0);

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

    const pushNotice = useCallback((kind: Notice['kind'], text: string) => {
        const id = ++noticeIdRef.current;
        setNotices((current) => [...current, { id, kind, text }].slice(-MAX_NOTICES));
        noticeTimersRef.current.push(
            window.setTimeout(() => {
                setNotices((current) => current.filter((notice) => notice.id !== id));
            }, NOTICE_MS)
        );
    }, []);

    const connect = useCallback(() => {
        if (connectingRef.current || roomRef.current) return;
        connectingRef.current = true;
        leavingRef.current = false;
        setStatus((prev) => (prev === 'reconnecting' ? prev : 'connecting'));
        setError(null);

        connectToGame(
            {
                onPhaseChanged: (event) => {
                    setPhase(event.phase);
                    setPhaseEndsAt(event.endsAt);
                },
                onGameOver: (event) => setGameOver(event),
                onPlayerDisconnected: (event: PlayerDisconnectedEvent) => {
                    const minutes = Math.max(1, Math.round(event.reconnectWindowMs / 60000));
                    pushNotice(
                        'warning',
                        `${event.name} disconnected — their spot is held for ${minutes} min`
                    );
                },
                onPlayerReconnected: (event: PlayerReconnectedEvent) => {
                    if (event.playerId === roomRef.current?.sessionId) return; // that's us
                    pushNotice('success', `${event.name} reconnected`);
                },
            },
            { name: loadPlayerName() }
        )
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

                reconnectingRef.current = false;
                reconnectAttemptsRef.current = 0;
                roomRef.current = joinedRoom;
                setRoom(joinedRoom);
                setLastSessionId(joinedRoom.sessionId);
                setStatus('connected');
                setGameOver(null);
                setPhase(joinedRoom.state.phase.phase);
                setPhaseEndsAt(joinedRoom.state.phase.endsAt);

                const $ = getStateCallbacks(joinedRoom);
                // Position, velocity and aim change every server tick for every moving player,
                // but the React UI (HUD, leaderboard, lobby, results) never shows them, and
                // re-rendering everything on each tick was wasted work. So only publish a new
                // roster when a field the UI actually displays has changed. (The Player objects
                // are live, so a component that does re-render always reads current values.)
                let lastSignature = '';
                const syncPlayers = () => {
                    const roster = Array.from(joinedRoom.state.players.values());
                    const signature = roster
                        .map(
                            (p) =>
                                `${p.id}|${p.name}|${p.color}|${p.teamId}|${p.character}|${p.ready}|${p.gun}|${p.structureInventory.join(',')}|${p.upgrades.join(',')}|${p.health}|${p.ammo}|${p.tilesOwned}|${p.kills}|${p.score}|${p.credits}|${p.claimRadius}|${p.connected}`
                        )
                        .join(';');
                    if (signature === lastSignature) return;
                    lastSignature = signature;
                    setPlayers(roster);
                };

                $(joinedRoom.state).players.onAdd((player) => {
                    $(player).onChange(syncPlayers);
                    // Items added to or removed from these lists don't fire the player's onChange.
                    $(player).structureInventory.onAdd(syncPlayers);
                    $(player).structureInventory.onRemove(syncPlayers);
                    $(player).upgrades.onAdd(syncPlayers);
                    $(player).upgrades.onRemove(syncPlayers);
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
                    reconnectingRef.current = true;
                    reconnectAttemptsRef.current = 0;
                    setStatus('reconnecting');
                    retryTimeoutRef.current = window.setTimeout(
                        () => connectRef.current(),
                        RECONNECT_RETRY_MS
                    );
                });
            })
            .catch((err: unknown) => {
                // A failed reconnect (server unreachable for a moment, laptop just woke up...) is
                // not the end: keep trying for the length of the server's reconnect window.
                if (
                    reconnectingRef.current &&
                    reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS
                ) {
                    reconnectAttemptsRef.current++;
                    setStatus('reconnecting');
                    retryTimeoutRef.current = window.setTimeout(
                        () => connectRef.current(),
                        RECONNECT_RETRY_MS
                    );
                    return;
                }
                reconnectingRef.current = false;
                setStatus('error');
                setError(
                    err instanceof Error ? err.message : 'Failed to connect to the game server'
                );
            })
            .finally(() => {
                connectingRef.current = false;
            });
    }, [pushNotice]);

    useEffect(() => {
        connectRef.current = connect;
    }, [connect]);

    // A hidden tab has its timers throttled (or is frozen outright), so a dropped connection can sit
    // waiting on a slow retry timer. The moment the tab is visible again (or the network comes
    // back), skip the wait and reconnect now.
    useEffect(() => {
        const retryNow = () => {
            if (document.visibilityState === 'hidden' || !reconnectingRef.current) return;
            window.clearTimeout(retryTimeoutRef.current);
            retryTimeoutRef.current = undefined;
            connectRef.current(); // no-op if an attempt is already in flight
        };
        document.addEventListener('visibilitychange', retryNow);
        window.addEventListener('online', retryNow);
        return () => {
            document.removeEventListener('visibilitychange', retryNow);
            window.removeEventListener('online', retryNow);
        };
    }, []);

    // Pending notice timers must not fire after the provider is gone.
    useEffect(() => {
        const timers = noticeTimersRef;
        return () => timers.current.forEach((timer) => window.clearTimeout(timer));
    }, []);

    const leave = useCallback(() => {
        clearRetryTimeout();
        reconnectingRef.current = false;
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
        (tileX: number, tileY: number, structureType: StructureType) => {
            if (!room) return;
            sendPlaceStructure(room, tileX, tileY, structureType, ++seqRef.current);
        },
        [room]
    );

    const selectTeam = useCallback(
        (teamId: TeamId) => {
            if (!room) return;
            sendSelectTeam(room, teamId);
        },
        [room]
    );

    const selectCharacter = useCallback(
        (characterId: CharacterId) => {
            if (!room) return;
            sendSelectCharacter(room, characterId);
        },
        [room]
    );

    const setName = useCallback(
        (name: string) => {
            const normalized = normalizePlayerName(name);
            if (!room || normalized === null) return;
            savePlayerName(normalized);
            sendSetName(room, normalized);
        },
        [room]
    );

    const setReady = useCallback(
        (ready: boolean) => {
            if (!room) return;
            sendSetReady(room, ready);
        },
        [room]
    );

    const purchase = useCallback(
        (itemId: ShopItemId) => {
            if (!room) return;
            sendPurchase(room, itemId);
        },
        [room]
    );

    const value = useMemo<GameContextValue>(
        () => ({
            status,
            error,
            room,
            sessionId: room?.sessionId ?? null,
            lastSessionId,
            notices,
            phase,
            phaseEndsAt,
            players,
            gameOver,
            connect,
            leave,
            input,
            shoot,
            placeStructure,
            selectTeam,
            selectCharacter,
            setReady,
            setName,
            purchase,
            playAgain,
            exitResults,
        }),
        [
            status,
            error,
            room,
            lastSessionId,
            notices,
            phase,
            phaseEndsAt,
            players,
            gameOver,
            connect,
            leave,
            input,
            shoot,
            placeStructure,
            selectTeam,
            selectCharacter,
            setReady,
            setName,
            purchase,
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
