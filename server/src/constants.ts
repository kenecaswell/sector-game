// Central tunables shared across systems and GameRoom. Keeping these in one
// place avoids the same magic number (e.g. tile size) drifting out of sync
// between MovementSystem, CombatSystem, CollisionSystem, and GameRoom.

export const TICK_RATE = 20; // Hz
export const TILE_SIZE = 32; // pixels per tile, both axes
export const RECONNECT_WINDOW_SECONDS = 180; // 3 minutes

export const PLAYER_SPEED = 200; // pixels/sec
export const PLAYER_RADIUS = 16; // pixels, for projectile collision

export const PROJECTILE_RADIUS = 6; // pixels, for player collision
export const PROJECTILE_DAMAGE = 25;
export const PROJECTILE_LIFETIME_MS = 2000;
