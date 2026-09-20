// Shared message shapes between client and server.
// Mirrors the "Message Shapes" section of docs/technical-blueprint.md.
// Copy or symlink this file into client/src/types/shared.ts to keep both sides in sync.

export type GamePhase = 'lobby' | 'claiming' | 'combat' | 'results';

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

export interface PlayerDisconnectedEvent {
  playerId: string;
  reconnectWindowMs: number;
}

export interface PlayerReconnectedEvent {
  playerId: string;
}

export interface GameOverEvent {
  scores: Array<{ playerId: string; tilesOwned: number; kills: number }>;
}
