// Mirrors server/src/constants.ts — keep tile/entity sizes in sync so
// rendering lines up with the server's authoritative collision math.
export const TILE_SIZE = 32;
export const PLAYER_RADIUS = 16;
export const PROJECTILE_RADIUS = 6;

// How often movement input is sent to the server. Sending faster than the
// server's tick rate (20Hz = 50ms) wastes bandwidth since the server only
// keeps the latest input per player anyway.
export const INPUT_SEND_INTERVAL_MS = 50;

// Camera-follow smoothing and cross-entity position lerp factor (0-1 per frame).
export const POSITION_LERP_FACTOR = 0.25;

export const UNCLAIMED_TILE_COLOR = 0x2a2a3d;
export const TILE_GRID_LINE_COLOR = 0x1a1a2e;
