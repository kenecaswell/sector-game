// What a bot remembers between ticks (server only, never synced). BotSystem keeps one per bot in
// GameState.botBrains.

import type { HexCoord } from '../hex';

export type BotGoal = 'claim' | 'build' | 'chase';

export interface BotBrain {
    nextThinkAt: number; // server ms; see BotProfile.thinkMs
    goal: BotGoal;
    route: HexCoord[]; // hexes still to walk through, the next one first; empty = none
    replanAt: number; // a claiming route is re-planned by then even if it still looks good
    idleUntil: number; // dawdling (Easy) until then
    // Stuck detection: where it was when the current window started, and when that was.
    progressX: number;
    progressY: number;
    progressAt: number;
    unstickUntil: number; // walking in a random direction until then, to get free
    unstickAngle: number;
    lastX: number; // where it was last tick, to notice a respawn (a jump back to the spawn)
    lastY: number;
    // Combat
    chaseId: string; // the enemy player it's going after, '' = none
    targetId: string; // the enemy player or structure in its sights, '' = none
    sightedAt: number; // when targetId came into its sights (it fires reactionMs later)
    lastShotAt: number;
    strafeSign: number; // 1 or -1: which way it circles a chased enemy
    strafeFlipAt: number;
    // Fabricating
    nextShopAt: number;
    structuresBought: number; // how many shopPlan structure entries it has fabricated
    // Building: it gives up on a spot it can't finish claiming by buildUntil, and doesn't look for
    // another until nextBuildAt.
    buildUntil: number;
    nextBuildAt: number;
}

export function newBrain(): BotBrain {
    return {
        nextThinkAt: 0,
        goal: 'claim',
        route: [],
        replanAt: 0,
        idleUntil: 0,
        progressX: 0,
        progressY: 0,
        progressAt: 0,
        unstickUntil: 0,
        unstickAngle: 0,
        lastX: 0,
        lastY: 0,
        chaseId: '',
        targetId: '',
        sightedAt: 0,
        lastShotAt: 0,
        strafeSign: 1,
        strafeFlipAt: 0,
        nextShopAt: 0,
        structuresBought: 0,
        buildUntil: 0,
        nextBuildAt: 0,
    };
}
