// Shared message shapes between client and server.
// Mirrors server/src/types/shared.ts exactly — keep both files in sync by hand
// (see docs/technical-blueprint.md "Message Shapes" section for the source of truth).

export type GamePhase = 'lobby' | 'claiming' | 'combat' | 'results';

// Client -> Server
export interface InputMessage {
  dir: { x: number; y: number };
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
