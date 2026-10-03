// Thin wrapper around colyseus.js's Client/Room for the GameRoom.
//
// Two version-compatibility notes for anyone touching this file (see
// docs/ARCHITECTURE.md decisions log for the full story):
//  - The server runs colyseus@0.16.5 + @colyseus/schema@^3.0.0. colyseus.js
//    only ever published up to 0.16.22, which bundles @colyseus/schema@3.0.76
//    — that's the only verified-compatible client/server pairing. Do not bump
//    either side independently without re-running a live join/decode smoke test.
//  - colyseus.js decodes schema state by reflection, so this module never
//    imports the server's schema classes — see src/types/gameState.ts.
import { Client, getStateCallbacks, type Room } from 'colyseus.js';
import { SERVER_HTTP_URL, SERVER_URL } from './config';
import type {
    AddBotMessage,
    BackpackCollectedEvent,
    TileLimitReachedEvent,
    RemoveBotMessage,
    UpdateBotMessage,
    GameListing,
    GameOverEvent,
    GameSettings,
    InputAckEvent,
    EquipUpgradeMessage,
    InputMessage,
    JoinOptions,
    PlaceStructureMessage,
    PurchaseMessage,
    SelectCharacterMessage,
    SelectTeamMessage,
    SetNameMessage,
    SetReadyMessage,
    PlayerDisconnectedEvent,
    PlayerHitEvent,
    PlayerReconnectedEvent,
    PhaseChangedEvent,
    ShootMessage,
    PickupCollectedEvent,
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
    onPickupCollected?: (event: PickupCollectedEvent) => void;
    onBackpackCollected?: (event: BackpackCollectedEvent) => void;
    onTileLimitReached?: (event: TileLimitReachedEvent) => void;
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
    if (handlers.onPickupCollected)
        room.onMessage<PickupCollectedEvent>('pickupCollected', handlers.onPickupCollected);
    // Sent to you only: you took back one of your backpacks.
    if (handlers.onBackpackCollected)
        room.onMessage<BackpackCollectedEvent>('backpackCollected', handlers.onBackpackCollected);
    // Sent to you only: you're at your tile limit, so ground you walked over wasn't claimed.
    if (handlers.onTileLimitReached)
        room.onMessage<TileLimitReachedEvent>('tileLimitReached', handlers.onTileLimitReached);
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

/** Which game to get into: an existing one by its code, or a new one with these settings. */
export type ConnectTarget = { join: string } | { create: Partial<GameSettings> };

/**
 * Joins a game (or rejoins one, via a saved reconnection token) and wires up the discrete
 * server->client message handlers passed in `handlers`. `target` says which game: a code to join
 * (`joinById`: the code is the room id) or settings to create one with. `options` go with a fresh
 * join only (a reconnect keeps the player the server already has).
 * High-frequency/gameplay-critical events (movement, tile ownership) are not
 * modeled as discrete messages — they're plain Colyseus state, read directly
 * off `room.state` by the render loop.
 */
export async function connectToGame(
    handlers: GameEventHandlers,
    target: ConnectTarget,
    options: JoinOptions = {}
): Promise<GameRoom> {
    const savedToken = readReconnectionToken();
    const fresh = () =>
        'join' in target
            ? client.joinById<GameStateShape>(target.join, options)
            : client.create<GameStateShape>('GameRoom', { ...options, game: target.create });
    let room: GameRoom;

    if (savedToken) {
        try {
            room = await client.reconnect<GameStateShape>(savedToken);
        } catch {
            // Token expired, room closed, or server restarted — fall back to a fresh join.
            clearReconnectionToken();
            room = await fresh();
        }
    } else {
        room = await fresh();
    }

    saveReconnectionToken(room);
    bindMessageHandlers(room, handlers);

    return room;
}

/** The open games (GET /games), for the game list. */
export async function fetchGames(signal?: AbortSignal): Promise<GameListing[]> {
    const response = await fetch(`${SERVER_HTTP_URL}/games`, { signal });
    if (!response.ok) throw new Error(`The server answered ${response.status}`);
    return (await response.json()) as GameListing[];
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
    structureType: PlaceStructureMessage['structureType'],
    rotation: number,
    seq: number
): void {
    room.send<PlaceStructureMessage>('placeStructure', {
        tileX,
        tileY,
        structureType,
        rotation,
        seq,
    });
}

export function sendPurchase(room: GameRoom, itemId: PurchaseMessage['itemId']): void {
    room.send<PurchaseMessage>('purchase', { itemId });
}

export function sendSelectTeam(room: GameRoom, teamId: SelectTeamMessage['teamId']): void {
    room.send<SelectTeamMessage>('selectTeam', { teamId });
}

export function sendSelectCharacter(
    room: GameRoom,
    characterId: SelectCharacterMessage['characterId']
): void {
    room.send<SelectCharacterMessage>('selectCharacter', { characterId });
}

export function sendEquipUpgrade(
    room: GameRoom,
    upgradeId: EquipUpgradeMessage['upgradeId']
): void {
    room.send<EquipUpgradeMessage>('equipUpgrade', { upgradeId });
}

/** DEV ONLY (temporary): ask the server for DEV_MATERIALS (500). The M key, in dev builds only. */
export function sendDevMaterials(room: GameRoom): void {
    room.send('devMaterials');
}

export function sendSetName(room: GameRoom, name: string): void {
    room.send<SetNameMessage>('setName', { name });
}

export function sendSetReady(room: GameRoom, ready: boolean): void {
    room.send<SetReadyMessage>('setReady', { ready });
}

/** Lobby only: add a bot of this difficulty (any player may; see BotSystem on the server). */
export function sendAddBot(room: GameRoom, difficulty: AddBotMessage['difficulty']): void {
    room.send<AddBotMessage>('addBot', { difficulty });
}

export function sendRemoveBot(room: GameRoom, botId: string): void {
    room.send<RemoveBotMessage>('removeBot', { botId });
}

/** Lobby only: change a bot's difficulty, team or character (only the fields given). */
export function sendUpdateBot(room: GameRoom, update: UpdateBotMessage): void {
    room.send<UpdateBotMessage>('updateBot', update);
}

export { getStateCallbacks };
