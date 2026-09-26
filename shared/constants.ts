// Constants both the server and the client need to agree on. Each side's own constants file
// re-exports these alongside its side-only tunables, so import from there as usual.

export const HEX_SIZE = 32; // hex circumradius in world px (flat-top; see hex.ts)

// The client draws the world with y squashed by this factor (its ISO_SQUASH is this value).
// Player speed, acceleration and projectile speed are measured on-screen, i.e. 1 world px of y
// counts as this much as 1 world px of x, so moving straight up the screen is as fast as moving
// sideways. Set to 1 for speed that is uniform in world space instead (vertical then looks ~40%
// slower on screen).
export const SCREEN_Y_SCALE = 0.6;

export const PLAYER_RADIUS = 20; // world px: body size, projectile hit radius, structure collision
export const PROJECTILE_RADIUS = 6; // world px, for player collision (the same for every gun)

// Claiming: a player claims the hex they're standing on plus every hex whose center is within
// their claim radius. This is the radius without the Expander; the client shows a claim circle
// once a player's radius is larger.
export const BASE_CLAIM_RADIUS = HEX_SIZE;
