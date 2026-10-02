// The terrain's color schemes. Each match uses one, picked at random by the server
// (GameState.theme, see TERRAIN_THEME_IDS in shared/types.ts), so everyone in it sees the same map.
// terrainArt.ts and GameScene draw with whichever palette the match has.

import type { TerrainThemeId } from '../types/shared';

/** A layer of smooth color patches over the ground (see terrainArt.groundColor). */
export interface GroundPatch {
    color: number; // what the ground drifts toward inside a patch
    scale: number; // patch size, scene px
    seed: number;
    from: number; // noise below this: none of it
    to: number; // noise above this: all of `amount`
    amount: number; // the most the ground mixes toward `color` (0..1)
}

export interface TerrainPalette {
    id: TerrainThemeId;
    name: string;
    background: number; // around the map
    outline: number; // lines between ground hexes
    cliff: number; // cliff faces at the map edge, and the banks down to water
    cliffDark: number; // the cliff face straight below a hex (in shadow)
    ground: {
        base: number;
        patches: readonly GroundPatch[];
        lightGrain: number; // frost / pale sand
        darkGrain: number; // pebbles
        accentGrain: number; // the patches' specks (maroon tholin, rust): likelier where they lie
        crack: number;
        frost: number;
    };
    rock: {
        shadow: number; // facets are shaded between these three by how much they face the light
        mid: number;
        light: number;
        soot: number; // texture specks and strata
        grit: number;
        slopeDust: number; // the ground's dust on a mountain's lower slopes ...
        slopeDustAmount: number; // ... and how much (0..1)
    };
    snow: { shadow: number; light: number };
    scree: number; // the tops of mountain hexes
    screeSpeck: number;
    liquid: {
        deep: number;
        deepDark: number; // the middle of a lake darkens toward this
        shallow: number; // wadeable: must never be mistaken for deep
        shallowBed: number; // pebbles showing through it
        ripple: number;
        foam: number; // the wet line along every shore
        sparkle: number;
        reflection: number; // the sky mirrored in deep liquid ...
        deepGleam: number; // ... at most this much (0 = no reflections)
        glint: number; // thin bright streaks where it gleams most
    };
}

/**
 * Slate (2026-09-30): slate ground drifting into brown and maroon dust, cold gray mountains with
 * white snow, blue lakes and turquoise shallows.
 */
const SLATE: TerrainPalette = {
    id: 'slate',
    name: 'Slate',
    background: 0x1a1a2e,
    outline: 0x1a1a2e,
    cliff: 0x2c2a3d,
    cliffDark: 0x211f2e,
    ground: {
        base: 0x3a4763,
        patches: [
            { color: 0x4b4249, scale: 300, seed: 11, from: 0.45, to: 0.85, amount: 0.6 }, // brown
            { color: 0x503546, scale: 150, seed: 12, from: 0.62, to: 0.9, amount: 0.55 }, // maroon
        ],
        lightGrain: 0xdde6f0,
        darkGrain: 0x222a3b,
        accentGrain: 0x7c4049,
        crack: 0x212838,
        frost: 0xe6edf5,
    },
    rock: {
        shadow: 0x262838,
        mid: 0x5d6076,
        light: 0xc2c5d3,
        soot: 0x161825,
        grit: 0xd3d7e2,
        slopeDust: 0x4b4249,
        slopeDustAmount: 0.3,
    },
    snow: { shadow: 0x9fb0c8, light: 0xf5f8fc },
    scree: 0x4a4858,
    screeSpeck: 0x35333f,
    liquid: {
        deep: 0x1b477d,
        deepDark: 0x143760,
        shallow: 0x2d7f98,
        shallowBed: 0xa7b58c,
        ripple: 0x9ed4f0,
        foam: 0xdcf1fb,
        sparkle: 0xffffff,
        reflection: 0x9ed4f0,
        deepGleam: 0,
        glint: 0xffffff,
    },
};

/**
 * Titan (2026-10-01): the moon under its orange haze, kept readable for Earth eyes. Coffee-brown
 * ground with tan dunes and charcoal ice rock; soot-coated mountains with cream frost caps; inky
 * liquid methane with a dark bronze sheen and gold glints; golden amber shallows, far brighter than
 * the deep liquid and more saturated than the dull tan ground, so they can't be confused with either.
 */
const TITAN: TerrainPalette = {
    id: 'titan',
    name: 'Titan',
    background: 0x1c140f,
    outline: 0x221912,
    cliff: 0x3a2a20,
    cliffDark: 0x2b1f18,
    ground: {
        base: 0x5a4535,
        patches: [
            { color: 0x7f5d3c, scale: 300, seed: 11, from: 0.45, to: 0.85, amount: 0.65 }, // dunes
            { color: 0x3e3734, scale: 150, seed: 12, from: 0.55, to: 0.85, amount: 0.75 }, // ice rock
        ],
        lightGrain: 0xe6d2b0,
        darkGrain: 0x221b17,
        accentGrain: 0x93492b,
        crack: 0x241a14,
        frost: 0xead9bd,
    },
    rock: {
        shadow: 0x221d1b,
        mid: 0x4f4540,
        light: 0x9a8a7a,
        soot: 0x15110f,
        grit: 0xc9b49a,
        slopeDust: 0x7d5c3c,
        slopeDustAmount: 0.5,
    },
    snow: { shadow: 0xa38c70, light: 0xefe0c4 },
    scree: 0x3c332d,
    screeSpeck: 0x2a231f,
    liquid: {
        deep: 0x1c1815,
        deepDark: 0x0f0d0b,
        shallow: 0xb07a22,
        shallowBed: 0xd8ad6a,
        ripple: 0xc39046,
        foam: 0xd8b37a,
        sparkle: 0xffd98a,
        reflection: 0xd08a2a,
        deepGleam: 0.3,
        glint: 0xf2c66c,
    },
};

export const TERRAIN_PALETTES: Record<TerrainThemeId, TerrainPalette> = {
    slate: SLATE,
    titan: TITAN,
};

/** The palette for a theme id from the server; Slate for anything unknown. */
export function paletteFor(theme: string): TerrainPalette {
    return Object.hasOwn(TERRAIN_PALETTES, theme)
        ? TERRAIN_PALETTES[theme as TerrainThemeId]
        : SLATE;
}
