// Central tunables shared across systems and GameRoom. Keeping these in one
// place avoids the same magic number (e.g. tile size) drifting out of sync
// between MovementSystem, CombatSystem, CollisionSystem, and GameRoom.

export const TICK_RATE = 20; // Hz
export const HEX_SIZE = 32; // hex circumradius in pixels (flat-top; see hex.ts)
export const RECONNECT_WINDOW_SECONDS = 180; // 3 minutes

export const PLAYER_SPEED = 200; // pixels/sec, top speed
// If a client sends nothing for this long (tab backgrounded, connection stalled), its last
// input is discarded and the player coasts to a stop instead of running on forever. The client
// re-sends its input at least every 250ms while active, so this leaves generous margin.
export const INPUT_STALE_MS = 750;
export const PLAYER_ACCEL = 1200; // pixels/sec^2 — speeding up, slowing down, and turning all use this, so movement eases instead of snapping
export const PLAYER_RADIUS = 16; // pixels, for projectile collision

export const PROJECTILE_RADIUS = 6; // pixels, for player collision
export const PROJECTILE_DAMAGE = 25;
export const PROJECTILE_LIFETIME_MS = 2000;

export const CREDIT_PAYOUT_INTERVAL_MS = 10_000; // 1 credit per owned tile, every 10s
