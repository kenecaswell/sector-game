// Test data builders. Each returns a complete, valid object with overrides applied.
import type { PlayerState } from '../types/gameState';
import type { FinalScore } from '../types/shared';

export function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
    return {
        id: 'p1',
        name: 'Player 1',
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        angle: 0,
        health: 100,
        maxHealth: 100,
        ammo: 0,
        tilesOwned: 0,
        kills: 0,
        score: 0,
        credits: 0,
        claimRadius: 32,
        connected: true,
        color: '#e74c3c',
        teamId: 'red',
        character: 'farmer',
        ready: false,
        gun: '',
        structureInventory: [],
        upgrades: [],
        ...overrides,
    };
}

export function makeScore(overrides: Partial<FinalScore> = {}): FinalScore {
    return {
        playerId: 'p1',
        name: 'Player 1',
        color: '#e74c3c',
        teamId: 'red',
        score: 0,
        tilesOwned: 0,
        kills: 0,
        structures: 0,
        ...overrides,
    };
}
