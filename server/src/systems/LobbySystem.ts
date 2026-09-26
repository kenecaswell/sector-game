import type { GameState, Player } from '../state/GameState';
import {
    PLAYER_NAME_MAX_LENGTH,
    TEAMS,
    TEAM_IDS,
    isCharacterId,
    isTeamId,
    nameLength,
    normalizePlayerName,
    type TeamId,
} from '../types/shared';
import { CharacterSystem } from './CharacterSystem';
import { PhaseSystem } from './PhaseSystem';
import type { Broadcast } from './Broadcast';

/**
 * The pre-match lobby: each player picks a team (color) and a character and marks themselves
 * ready. Once every connected player is ready, a short countdown runs (the `countdown` phase);
 * if anyone un-readies or a new player joins meanwhile, it's cancelled back to `lobby`. When it
 * finishes, everyone gets their character's starting kit and the match begins. Players can also
 * rename themselves here.
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

/**
 * `name`, made unique among the other players (compared ignoring case): if it's taken, the first
 * free "name (1)", "name (2)", ... — shortening `name` if needed so the result still fits in
 * PLAYER_NAME_MAX_LENGTH. `exceptId` is the player being named (their own current name doesn't count).
 */
function uniqueName(state: GameState, name: string, exceptId = ''): string {
    const taken = new Set<string>();
    state.players.forEach((p) => {
        if (p.id !== exceptId) taken.add(p.name.toLowerCase());
    });
    if (!taken.has(name.toLowerCase())) return name;

    for (let n = 1; ; n++) {
        const suffix = ` (${n})`;
        const room = PLAYER_NAME_MAX_LENGTH - suffix.length;
        const base =
            nameLength(name) > room ? Array.from(name).slice(0, room).join('').trimEnd() : name;
        const candidate = base + suffix;
        if (!taken.has(candidate.toLowerCase())) return candidate;
    }
}

/** A newcomer's name: their saved one if it's valid, else "Player N"; unique either way. */
function joiningName(state: GameState, requested: unknown): string {
    return uniqueName(state, normalizePlayerName(requested) ?? `Player ${state.players.size + 1}`);
}

/** Renaming is allowed in the lobby even while ready — it doesn't change anything that matters. */
function setName(state: GameState, player: Player, name: unknown): boolean {
    const normalized = normalizePlayerName(name);
    if (!inLobby(state) || normalized === null) return false;
    player.name = uniqueName(state, normalized, player.id);
    return true;
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
    uniqueName,
    joiningName,
    setName,
    selectTeam,
    selectCharacter,
    setReady,
    everyoneReady,
    update,
};
