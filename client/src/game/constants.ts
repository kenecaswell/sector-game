// Mirrors server/src/constants.ts — keep hex/entity sizes in sync so
// rendering lines up with the server's authoritative collision math.
export const HEX_SIZE = 32; // circumradius in world pixels (flat-top)
export const PLAYER_RADIUS = 16;
export const PROJECTILE_RADIUS = 6;

// --- Isometric look (render-only; the server never sees any of this) ---
// The world is simulated top-down. On screen, y is multiplied by ISO_SQUASH to
// tilt the map away from the viewer (1 = straight top-down, ~0.5 = steep 2:1).
export const ISO_SQUASH = 0.6;
export const HEX_DEPTH = 12; // screen px of the cliff face under each hex
export const BODY_LIFT = 10; // screen px a player/projectile floats above the ground
export const STRUCTURE_LIFT = 8;

// How often movement input is sent to the server. Sending faster than the
// server's tick rate (20Hz = 50ms) wastes bandwidth since the server only
// keeps the latest input per player anyway.
export const INPUT_SEND_INTERVAL_MS = 50;
export const INPUT_KEEPALIVE_MS = 250; // resend even if unchanged, in case a packet dropped

// --- Smoothness ---
// Rendered positions chase the server's latest state with frame-rate-independent
// exponential smoothing. Server state arrives at 20Hz, so the target is nudged
// forward by the entity's velocity to hide most of the gap between updates.
export const SMOOTHING_RATE = 20; // higher = tighter/less smooth (per second)
export const EXTRAPOLATION_S = 0.05;
export const SNAP_DISTANCE = HEX_SIZE * 2; // bigger jumps (respawn) teleport instead of gliding

// Desktop controls. true: W/S move toward/away from the mouse and A/D strafe
// (twin-stick style). false: WASD move in fixed screen directions and the
// mouse only aims.
export const MOVE_RELATIVE_TO_AIM = true;

// --- Colors ---
export const BACKGROUND_COLOR = 0x1a1a2e;
export const HEX_TOP_COLOR = 0x3a4763;
export const HEX_SIDE_COLOR = 0x262f45;
export const HEX_SIDE_DARK_COLOR = 0x1d2436;
export const HEX_OUTLINE_COLOR = 0x1a1a2e;
export const CLAIM_BLEND = 0.65; // how strongly an owner's color tints a claimed hex top
