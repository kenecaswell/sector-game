// Each player's spawn zone: their spawn spot's hex and the six around it (7 hexes, the size of a
// structure's footprint). Only that player and their teammates may claim them, so nobody can build
// a structure on or beside another player's spawn.

import type { GameState } from './state/GameState';
import { hexDistance, hexIndex, isValidHex, type HexCoord } from './hex';
import { areAllies } from './teams';

/** The center of `player`'s spawn zone: the hex they start and respawn on. */
function spawnHex(player: { spawnTileX: number; spawnTileY: number }): HexCoord {
    return { col: player.spawnTileX, row: player.spawnTileY };
}

/** True if hex (col, row) is in the spawn zone of a player who isn't `playerId` or their teammate. */
export function isSpawnZoneOfOther(
    state: GameState,
    col: number,
    row: number,
    playerId: string
): boolean {
    for (const owner of state.players.values()) {
        if (owner.id === playerId || areAllies(state, owner.id, playerId)) continue;
        if (hexDistance({ col, row }, spawnHex(owner)) <= 1) return true;
    }
    return false;
}

/** The tile indices `playerId` may not claim because they're in someone else's spawn zone. */
export function otherSpawnZones(state: GameState, playerId: string): Set<number> {
    const zone = new Set<number>();
    for (const owner of state.players.values()) {
        if (owner.id === playerId || areAllies(state, owner.id, playerId)) continue;
        const center = spawnHex(owner);
        for (let dRow = -1; dRow <= 1; dRow++) {
            for (let dCol = -1; dCol <= 1; dCol++) {
                const hex = { col: center.col + dCol, row: center.row + dRow };
                if (!isValidHex(hex.col, hex.row, state.mapWidth, state.mapHeight)) continue;
                if (hexDistance(hex, center) <= 1)
                    zone.add(hexIndex(hex.col, hex.row, state.mapWidth));
            }
        }
    }
    return zone;
}
