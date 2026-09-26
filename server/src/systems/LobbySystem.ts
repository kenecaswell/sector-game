import type { GameState, Player } from '../state/GameState';
import { TEAMS, TEAM_IDS, isCharacterId, isTeamId, type TeamId } from '../types/shared';
import { CharacterSystem } from './CharacterSystem';
import { PhaseSystem } from './PhaseSystem';
import type { Broadcast } from './Broadcast';

/**
 * The pre-match lobby: each player picks a team (color) and a character and marks themselves
 * ready. Once every connected player is ready, a short countdown runs (the `countdown` phase);
 * if anyone un-readies or a new player joins meanwhile, it's cancelled back to `lobby`. When it
 * finishes, everyone gets their character's starting kit and the match begins.
 */

const inLobby = (state: GameState): boolean =>
    state.phase.phase === 'lobby' || state.phase.phase === 'countdown';

/** A new player's team: the first one nobody is on yet, else the one with the fewest players. */
function defaultTeam(state: GameState): TeamId {
    const counts = new Map<string, number>();
    state.players.forEach((p) => counts.set(p.teamId, (counts.get(p.teamId) ?? 0) + 1));
    let best = TEAM_IDS[0];
    for (const id of TEAM_IDS) {
        if ((counts.get(id) ?? 0) < (counts.get(best) ?? 0)) best = id;
    }
    return best;
}

function setTeam(player: Player, teamId: TeamId): void {
    player.teamId = teamId;
    player.color = TEAMS[teamId].color;
}

/** Team and character are locked while ready, so what everyone saw when they readied holds. */
function selectTeam(state: GameState, player: Player, teamId: unknown): boolean {
    if (!inLobby(state) || player.ready || !isTeamId(teamId)) return false;
    setTeam(player, teamId);
    return true;
}

function selectCharacter(state: GameState, player: Player, characterId: unknown): boolean {
    if (!inLobby(state) || player.ready || !isCharacterId(characterId)) return false;
    player.character = characterId;
    return true;
}

function setReady(state: GameState, player: Player, ready: unknown): boolean {
    if (!inLobby(state) || typeof ready !== 'boolean') return false;
    player.ready = ready;
    return true;
}

/**
 * Everyone who is connected is ready (and there is at least one such player). Disconnected
 * players don't hold the match up; if they come back they land in it with their pick.
 */
function everyoneReady(state: GameState): boolean {
    let connected = 0;
    for (const player of state.players.values()) {
        if (!player.connected) continue;
        if (!player.ready) return false;
        connected++;
    }
    return connected > 0;
}

function update(state: GameState, broadcast: Broadcast): void {
    const phase = state.phase.phase;
    if (phase === 'lobby') {
        if (everyoneReady(state)) PhaseSystem.transitionTo(state, 'countdown', broadcast);
    } else if (phase === 'countdown') {
        if (!everyoneReady(state)) {
            PhaseSystem.transitionTo(state, 'lobby', broadcast);
        } else if (Date.now() >= state.phase.endsAt) {
            state.players.forEach((player) => CharacterSystem.apply(player));
            PhaseSystem.transitionTo(state, 'playing', broadcast);
        }
    }
}

export const LobbySystem = {
    defaultTeam,
    setTeam,
    selectTeam,
    selectCharacter,
    setReady,
    everyoneReady,
    update,
};
