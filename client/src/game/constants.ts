// Client tunables. Sizes the server must agree on (HEX_SIZE, PLAYER_RADIUS, PROJECTILE_RADIUS,
// BASE_CLAIM_RADIUS, SCREEN_Y_SCALE) live in shared/constants.ts and are re-exported here, so
// rendering always lines up with the server's collision math. A claim radius above
// BASE_CLAIM_RADIUS means the player owns the Expander.
import { HEX_SIZE, SCREEN_Y_SCALE } from '../../../shared/constants';

export * from '../../../shared/constants';

// The tinted ground circle showing an Expander owner's claim radius (in the player's color).
// A player whose connection dropped stays on the map, frozen (the server holds their seat and tiles
// for the reconnect window). They're drawn dimmed by this much so they read as "not here right now"
// rather than disappearing.
export const DISCONNECTED_ALPHA = 0.4;
export const CLAIM_RING_FILL_ALPHA = 0.3;
export const CLAIM_RING_STROKE_ALPHA = 0.7;
// Shot looks, by gun (told apart by the projectile's damage). Drawn radius = PROJECTILE_RADIUS x scale.
export const BASIC_SHOT_SCALE = 0.7; // a small white bolt
export const BASIC_SHOT_COLORS = { core: 0xffffff, stroke: 0xdfe6ee, glow: 0xffffff };
export const BIG_SHOT_SCALE = 1.3; // the original yellow bolt, a bit bigger
export const BIG_SHOT_COLORS = { core: 0xfff2a8, stroke: 0xffb300, glow: 0xffe066 };

// --- Isometric look (render-only; the server never sees any of this) ---
// The world is simulated top-down. On screen, y is multiplied by ISO_SQUASH to
// tilt the map away from the viewer (1 = straight top-down, ~0.5 = steep 2:1). It *is* the server's
// SCREEN_Y_SCALE, since speeds are measured on screen.
export const ISO_SQUASH = SCREEN_Y_SCALE;
export const HEX_DEPTH = 12; // screen px of the cliff face under each hex
export const BODY_LIFT = 10; // screen px a player/projectile floats above the ground
// Structures are drawn as a raised slab in the shape of their 7-hex hexagon (see hex.ts): a top face
// this many screen px above the ground, with side faces down to it.
export const STRUCTURE_HEIGHT = 14;

// How often movement input is sent to the server. Sending faster than the
// server's tick rate (20Hz = 50ms) wastes bandwidth since the server only
// keeps the latest input per player anyway.
export const INPUT_SEND_INTERVAL_MS = 50;
export const INPUT_KEEPALIVE_MS = 250; // resend even if unchanged, in case a packet dropped

// --- Click-to-move (right-click on desktop) ---
export const TARGET_ARRIVE_DISTANCE = 10; // world px: closer than this counts as arrived
export const TARGET_SLOW_DISTANCE = 80; // world px: ease the speed off inside this so we stop on the spot
export const TARGET_STUCK_MS = 1200; // give up if there's no progress this long (blocked by a structure...)
export const TARGET_MARKER_COLOR = 0xffffff;

// --- Shooting ---
// Minimum time between shots for held Space / the mobile fire button and rapid clicking.
// Client-side only for now: the server has no fire-rate limit (see blueprint Known Issues).
export const FIRE_INTERVAL_MS = 200;

// --- Smoothness ---
// Rendered positions chase the server's latest state with frame-rate-independent
// exponential smoothing. Server state arrives at 20Hz, so the target is nudged
// forward by the entity's velocity to hide most of the gap between updates.
export const SMOOTHING_RATE = 20; // higher = tighter/less smooth (per second)
export const EXTRAPOLATION_S = 0.05;
export const SNAP_DISTANCE = HEX_SIZE * 2; // bigger jumps (respawn) teleport instead of gliding

// Desktop controls. false (default): WASD/arrows move in fixed on-screen
// directions and the mouse only aims/shoots. true: W/S move toward/away from
// the mouse and A/D strafe (tank/twin-stick style) — it feels like chasing the
// cursor, because the camera follows you and the cursor stays fixed on screen,
// so its world position keeps moving away as you approach it.
export const MOVE_RELATIVE_TO_AIM = false;

// true: movement is equally fast in every on-screen direction. Because the map is
// tilted, that means covering more *world* distance per second up/down than
// sideways (the server measures speed with the same tilt: ISO_SQUASH is the shared
// SCREEN_Y_SCALE). false: speed is uniform in world space, so straight up/down the
// screen looks ~40% slower than sideways. This only changes how the client turns
// input into a direction; the server's speed rules are the same either way.
export const UNIFORM_SCREEN_SPEED = true;

// --- Terrain rendering ---
// The claim (ownership) layer is split into square RenderTexture chunks this many scene pixels
// wide, so a change re-bakes only the chunk(s) it touches rather than every claimed hex.
export const CLAIM_CHUNK_SIZE = 512;

// --- Colors ---
export const BACKGROUND_COLOR = 0x1a1a2e;
export const HEX_TOP_COLOR = 0x3a4763;
export const HEX_SIDE_COLOR = 0x262f45;
export const HEX_SIDE_DARK_COLOR = 0x1d2436;
export const HEX_OUTLINE_COLOR = 0x1a1a2e;
export const CLAIM_BLEND = 0.65; // how strongly an owner's color tints a claimed hex top
export const CLAIM_BORDER_DARKEN = 0.1; // border of a claimed hex: its fill, darkened by this much
export const CLAIM_BORDER_WIDTH = 2;

// --- Structures (placeholder look until there's art) ---
// Top-face color by structure type. The sides and the border are the owner's team color, so the
// type reads from the top and the team from the edge. Chosen muted/pale so the team edge stands out.
export const STRUCTURE_COLORS: Record<string, number> = {
    farm: 0xc5d86d, // pale lime: a field
    mine: 0x6d4c41, // dark brown: earth
    fort: 0xb0a18a, // sandstone
    power: 0x80deea, // pale cyan: electric
};
export const STRUCTURE_DEFAULT_COLOR = 0xdddddd; // an unknown type
export const STRUCTURE_SIDE_DARKEN = 0.35; // team color, darkened this much, for the side faces
export const STRUCTURE_BORDER_WIDTH = 3;
export const BUILD_PREVIEW_OK_COLOR = 0xf1c40f;
export const BUILD_PREVIEW_BAD_COLOR = 0xe74c3c;
export const BUILD_PREVIEW_TAP_MS = 1200; // touch has no hover: a refused tap shows its outline this long
