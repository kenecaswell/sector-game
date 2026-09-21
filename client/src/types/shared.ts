// Shared message shapes between client and server.
// Mirrors server/src/types/shared.ts exactly — keep both files in sync by hand
// (see docs/technical-blueprint.md "Message Shapes" section for the source of truth).

export type GamePhase = 'lobby' | 'buying' | 'playing' | 'results';

// Client -> Server
export interface InputMessage {
    // Desired movement direction in world space. Magnitude 0..1 is honored
    // (analog joystick), anything longer is clamped to 1 server-side.
    dir: { x: number; y: number };
    // Where the player is facing/aiming, radians in world space. Optional so
    // older clients that only send `dir` still work.
    angle?: number;
    seq: number;
}

export interface ShootMessage {
    angle: number;
    seq: number;
}

export interface PlaceStructureMessage {
    tileX: number;
    tileY: number;
    seq: number;
}

// Server -> Client, sent to the originating client only (not broadcast) —
// lets the client discard predicted inputs up to this seq once confirmed.
export interface InputAckEvent {
    seq: number;
}

// Server -> Client (discrete events; state deltas are handled by Colyseus itself)
export interface PlayerHitEvent {
    targetId: string;
    damage: number;
    shooterId: string;
}

export interface TilesClaimedEvent {
    tiles: Array<{ x: number; y: number; ownerId: string }>;
}

export interface StructureDestroyedEvent {
    structureId: string;
}

export interface PhaseChangedEvent {
    phase: GamePhase;
    endsAt: number;
}

// Sent to everyone when a player's connection drops without them leaving on purpose. Their
// player, tiles and structures stay put (frozen) for `reconnectWindowMs`.
export interface PlayerDisconnectedEvent {
    playerId: string;
    name: string;
    reconnectWindowMs: number;
}

// Sent to everyone else when a dropped player gets back in within their window.
export interface PlayerReconnectedEvent {
    playerId: string;
    name: string;
}

// One player's final standing.
export interface FinalScore {
    playerId: string;
    name: string;
    color: string;
    score: number;
    tilesOwned: number;
    kills: number;
    structures: number;
}

// Sent once when the match ends (phase -> results): the final standings, best first. Clients keep
// it so the results screen stays up after the room closes.
export interface GameOverEvent {
    scores: FinalScore[];
}

// --- Shop --------------------------------------------------------------------------------------
// The catalog is shared so the server (validation) and client (menu) always agree on prices.
// Keep this block identical in server/src/types/shared.ts and client/src/types/shared.ts.
export type ShopItemId = 'ammo' | 'expander';

export interface ShopItem {
    id: ShopItemId;
    name: string;
    description: string;
    cost: number; // credits
}

export const AMMO_PACK_SIZE = 30; // shots per purchase
export const AMMO_CREDITS_PER_SHOT = 1;

export const SHOP_ITEMS: Record<ShopItemId, ShopItem> = {
    ammo: {
        id: 'ammo',
        name: 'Ammo pack',
        description: `${AMMO_PACK_SIZE} shots (${AMMO_CREDITS_PER_SHOT} credit per shot)`,
        cost: AMMO_PACK_SIZE * AMMO_CREDITS_PER_SHOT,
    },
    expander: {
        id: 'expander',
        name: 'Expander',
        description: 'Claim hexes in a much larger radius. One per player.',
        cost: 100,
    },
};

export function isShopItemId(value: unknown): value is ShopItemId {
    return typeof value === 'string' && Object.hasOwn(SHOP_ITEMS, value);
}

// Client -> Server: buy an item (allowed during the `buying` and `playing` phases).
export interface PurchaseMessage {
    itemId: ShopItemId;
}
