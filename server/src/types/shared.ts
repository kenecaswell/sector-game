// Shared message shapes between client and server.
// Mirrors the "Message Shapes" section of docs/technical-blueprint.md.
// Copy or symlink this file into client/src/types/shared.ts to keep both sides in sync.

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
