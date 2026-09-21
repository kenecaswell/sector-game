// Thin wrapper around colyseus.js's Client/Room for the GameRoom.
//
// Two version-compatibility notes for anyone touching this file (see
// docs/technical-blueprint.md decisions log for the full story):
//  - The server runs colyseus@0.16.5 + @colyseus/schema@^3.0.0. colyseus.js
//    only ever published up to 0.16.22, which bundles @colyseus/schema@3.0.76
//    — that's the only verified-compatible client/server pairing. Do not bump
//    either side independently without re-running a live join/decode smoke test.
//  - colyseus.js decodes schema state by reflection, so this module never
//    imports the server's schema classes — see src/types/gameState.ts.
import { Client, getStateCallbacks, type Room } from 'colyseus.js';
import { SERVER_URL } from './config';
import type {
    GameOverEvent,
    InputAckEvent,
    InputMessage,
    PlaceStructureMessage,
    PurchaseMessage,
    PlayerDisconnectedEvent,
    PlayerHitEvent,
    PlayerReconnectedEvent,
    PhaseChangedEvent,
    ShootMessage,
    StructureDestroyedEvent,
    TilesClaimedEvent,
} from '../types/shared';
import type { GameStateShape } from '../types/gameState';

const RECONNECT_STORAGE_KEY = 'sector42.reconnectionToken';
// Close codes that mean "this was on purpose, don't reconnect": 1000 = normal closure, 4000 =
// Colyseus's CONSENTED code, which the server also uses when it deliberately closes a room
// (e.g. after the results period). Anything else (1006, ...) is treated as a dropped connection.
const FINAL_CLOSE_CODES = [1000, 4000];

export type GameRoom = Room<GameStateShape>;

export interface GameEventHandlers {
    onInputAck?: (event: InputAckEvent) => void;
    onPlayerHit?: (event: PlayerHitEvent) => void;
    onTilesClaimed?: (event: TilesClaimedEvent) => void;
    onStructureDestroyed?: (event: StructureDestroyedEvent) => void;
    onPhaseChanged?: (event: PhaseChangedEvent) => void;
    onPlayerDisconnected?: (event: PlayerDisconnectedEvent) => void;
    onPlayerReconnected?: (event: PlayerReconnectedEvent) => void;
    onGameOver?: (event: GameOverEvent) => void;
}

// A single Client per tab is all colyseus.js needs — it just holds the HTTP
// matchmake endpoint, not any connection state.
const client = new Client(SERVER_URL);

function bindMessageHandlers(room: GameRoom, handlers: GameEventHandlers): void {
    if (handlers.onInputAck) room.onMessage<InputAckEvent>('inputAck', handlers.onInputAck);
    if (handlers.onPlayerHit) room.onMessage<PlayerHitEvent>('playerHit', handlers.onPlayerHit);
    if (handlers.onTilesClaimed)
        room.onMessage<TilesClaimedEvent>('tilesClaimed', handlers.onTilesClaimed);
    if (handlers.onStructureDestroyed)
        room.onMessage<StructureDestroyedEvent>(
            'structureDestroyed',
            handlers.onStructureDestroyed
        );
    if (handlers.onPhaseChanged)
        room.onMessage<PhaseChangedEvent>('phaseChanged', handlers.onPhaseChanged);
    if (handlers.onPlayerDisconnected)
        room.onMessage<PlayerDisconnectedEvent>(
            'playerDisconnected',
            handlers.onPlayerDisconnected
        );
    if (handlers.onPlayerReconnected)
        room.onMessage<PlayerReconnectedEvent>('playerReconnected', handlers.onPlayerReconnected);
    if (handlers.onGameOver) room.onMessage<GameOverEvent>('gameOver', handlers.onGameOver);
}

function saveReconnectionToken(room: GameRoom): void {
    try {
        sessionStorage.setItem(RECONNECT_STORAGE_KEY, room.reconnectionToken);
    } catch {
        // sessionStorage unavailable (private browsing, etc.) — reconnection just won't be attempted.
    }
}

function readReconnectionToken(): string | null {
    try {
        return sessionStorage.getItem(RECONNECT_STORAGE_KEY);
    } catch {
        return null;
    }
}

export function clearReconnectionToken(): void {
    try {
        sessionStorage.removeItem(RECONNECT_STORAGE_KEY);
    } catch {
        // ignore
    }
}

/**
 * Joins (or rejoins, via a saved reconnection token) the GameRoom and wires
 * up the discrete server->client message handlers passed in `handlers`.
 * High-frequency/gameplay-critical events (movement, tile ownership) are not
 * modeled as discrete messages — they're plain Colyseus state, read directly
 * off `room.state` by the render loop.
 */
export async function connectToGame(handlers: GameEventHandlers): Promise<GameRoom> {
    const savedToken = readReconnectionToken();
    let room: GameRoom;

    if (savedToken) {
        try {
            room = await client.reconnect<GameStateShape>(savedToken);
        } catch {
            // Token expired, room closed, or server restarted — fall back to a fresh join.
            clearReconnectionToken();
            room = await client.joinOrCreate<GameStateShape>('GameRoom');
        }
    } else {
        room = await client.joinOrCreate<GameStateShape>('GameRoom');
    }

    saveReconnectionToken(room);
    bindMessageHandlers(room, handlers);

    return room;
}

export function leaveGame(room: GameRoom): Promise<number> {
    clearReconnectionToken();
    return room.leave(true);
}

export function isNormalClose(code: number): boolean {
    return FINAL_CLOSE_CODES.includes(code);
}

export function sendInput(
    room: GameRoom,
    dir: { x: number; y: number },
    seq: number,
    angle?: number
): void {
    room.send<InputMessage>('input', { dir, angle, seq });
}

export function sendShoot(room: GameRoom, angle: number, seq: number): void {
    room.send<ShootMessage>('shoot', { angle, seq });
}

export function sendPlaceStructure(
    room: GameRoom,
    tileX: number,
    tileY: number,
    seq: number
): void {
    room.send<PlaceStructureMessage>('placeStructure', { tileX, tileY, seq });
}

export function sendPurchase(room: GameRoom, itemId: PurchaseMessage['itemId']): void {
    room.send<PurchaseMessage>('purchase', { itemId });
}

export function sendStartGame(room: GameRoom): void {
    room.send('startGame');
}

// TEMPORARY testing shortcut (host only): end the buying phase early. See GameRoom.handleEndBuying.
export function sendEndBuying(room: GameRoom): void {
    room.send('endBuying');
}

export { getStateCallbacks };
