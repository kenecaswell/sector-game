import { beforeEach, describe, expect, it } from 'vitest';
import { COUNTDOWN_DURATION_MS, MATCH_DURATION_MS } from '../constants';
import { GameState } from '../state/GameState';
import { addPlayer } from '../test/world';
import { TEAMS, TEAM_IDS } from '../types/shared';
import { LobbySystem } from './LobbySystem';

describe('LobbySystem — ready-up and countdown', () => {
    let state: GameState;
    let phases: string[];
    const broadcast = (_type: string, payload: unknown) =>
        phases.push((payload as { phase: string }).phase);
    const tick = () => LobbySystem.update(state, broadcast);

    beforeEach(() => {
        state = new GameState();
        phases = [];
    });

    it('an empty lobby never starts on its own', () => {
        tick();
        expect(state.phase.phase).toBe('lobby');
        expect(phases).toEqual([]);
    });

    it('waits until every connected player is ready, then counts down', () => {
        const a = addPlayer(state, 'a');
        const b = addPlayer(state, 'b');
        LobbySystem.setReady(state, a, true);
        tick();
        expect(state.phase.phase).toBe('lobby');
        LobbySystem.setReady(state, b, true);
        tick();
        expect(state.phase.phase).toBe('countdown');
        expect(state.phase.endsAt - Date.now()).toBeGreaterThan(COUNTDOWN_DURATION_MS - 100);
    });

    it("doesn't wait for disconnected players, but a connected unready one holds it", () => {
        const a = addPlayer(state, 'a');
        const b = addPlayer(state, 'b');
        LobbySystem.setReady(state, a, true);
        b.connected = false;
        tick();
        expect(state.phase.phase).toBe('countdown');
        b.connected = true;
        tick();
        expect(state.phase.phase).toBe('lobby');
    });

    it('cancels the countdown when someone un-readies or a newcomer (unready) joins', () => {
        const a = addPlayer(state, 'a');
        LobbySystem.setReady(state, a, true);
        tick();
        LobbySystem.setReady(state, a, false);
        tick();
        expect(state.phase.phase).toBe('lobby');
        LobbySystem.setReady(state, a, true);
        tick();
        addPlayer(state, 'late');
        tick();
        expect(state.phase.phase).toBe('lobby');
        expect(phases).toEqual(['countdown', 'lobby', 'countdown', 'lobby']);
    });

    it('when the countdown ends: everyone gets their kit and the match starts', () => {
        const a = addPlayer(state, 'a');
        const b = addPlayer(state, 'b');
        LobbySystem.selectCharacter(state, b, 'explorer');
        LobbySystem.setReady(state, a, true);
        LobbySystem.setReady(state, b, true);
        tick();
        state.phase.endsAt = Date.now() - 1;
        tick();
        expect(state.phase.phase).toBe('playing');
        expect(state.phase.endsAt - Date.now()).toBeGreaterThan(MATCH_DURATION_MS - 100);
        expect(Array.from(a.structureInventory)).toEqual(['farm']);
        expect([b.gun, b.ammo, b.materials]).toEqual(['basic', 15, 15]);
    });
});

describe('LobbySystem — picks', () => {
    it('sets team (and color) and character while not ready', () => {
        const state = new GameState();
        const p = addPlayer(state, 'a');
        expect(LobbySystem.selectTeam(state, p, 'blue')).toBe(true);
        expect(LobbySystem.selectCharacter(state, p, 'robot')).toBe(true);
        expect([p.teamId, p.color, p.character]).toEqual(['blue', TEAMS.blue.color, 'robot']);
    });

    it('locks team and character while ready (but not your name)', () => {
        const state = new GameState();
        const p = addPlayer(state, 'a');
        LobbySystem.setReady(state, p, true);
        expect(LobbySystem.selectTeam(state, p, 'blue')).toBe(false);
        expect(LobbySystem.selectCharacter(state, p, 'robot')).toBe(false);
        expect(LobbySystem.setName(state, p, 'Carol')).toBe(true);
    });

    it('refuses junk values', () => {
        const state = new GameState();
        const p = addPlayer(state, 'a');
        expect(LobbySystem.selectTeam(state, p, 'pink')).toBe(false);
        expect(LobbySystem.selectTeam(state, p, '__proto__')).toBe(false);
        expect(LobbySystem.selectCharacter(state, p, 'wizard')).toBe(false);
        expect(LobbySystem.setReady(state, p, 'yes')).toBe(false);
        expect([p.teamId, p.character, p.ready]).toEqual(['', 'farmer', false]);
    });

    it('refuses every lobby choice once the match is on', () => {
        const state = new GameState();
        const p = addPlayer(state, 'a');
        state.phase.phase = 'playing';
        expect(LobbySystem.selectTeam(state, p, 'red')).toBe(false);
        expect(LobbySystem.selectCharacter(state, p, 'robot')).toBe(false);
        expect(LobbySystem.setReady(state, p, true)).toBe(false);
        expect(LobbySystem.setName(state, p, 'Dave')).toBe(false);
    });

    it('puts newcomers on an empty team first, then the smallest', () => {
        const state = new GameState();
        const teams: string[] = [];
        for (let i = 0; i < 10; i++) {
            teams.push(addPlayer(state, `p${i}`, 0, 0, LobbySystem.defaultTeam(state)).teamId);
        }
        expect(teams).toEqual([...TEAM_IDS, TEAM_IDS[0], TEAM_IDS[1]]);
    });
});

describe('LobbySystem — names', () => {
    it('gives a taken name the first free " (N)" suffix, ignoring case', () => {
        const state = new GameState();
        addPlayer(state, 'a').name = 'Bob';
        addPlayer(state, 'b').name = 'Bob (1)';
        expect(LobbySystem.uniqueName(state, 'Bob')).toBe('Bob (2)');
        expect(LobbySystem.uniqueName(state, 'bob')).toBe('bob (2)');
        expect(LobbySystem.uniqueName(state, 'Alice')).toBe('Alice');
    });

    it("doesn't count your own current name as a clash", () => {
        const state = new GameState();
        const a = addPlayer(state, 'a');
        a.name = 'Bob';
        expect(LobbySystem.setName(state, a, 'Bob')).toBe(true);
        expect(a.name).toBe('Bob');
    });

    it('shortens a long name so the suffix still fits in 25 characters', () => {
        const state = new GameState();
        addPlayer(state, 'a').name = 'x'.repeat(25);
        expect(LobbySystem.uniqueName(state, 'x'.repeat(25))).toBe('x'.repeat(21) + ' (1)');
    });

    it('names a newcomer from their saved name, else "Player N"', () => {
        const state = new GameState();
        addPlayer(state, 'a');
        addPlayer(state, 'b');
        expect(LobbySystem.joiningName(state, undefined)).toBe('Player 3');
        expect(LobbySystem.joiningName(state, 'a')).toBe('Player 3'); // too short
        expect(LobbySystem.joiningName(state, ' Cy ')).toBe('Cy');
    });

    it('ignores an invalid rename', () => {
        const state = new GameState();
        const p = addPlayer(state, 'a');
        p.name = 'Carol';
        expect(LobbySystem.setName(state, p, 'C')).toBe(false);
        expect(p.name).toBe('Carol');
    });
});
