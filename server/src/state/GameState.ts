import { Schema, MapSchema, ArraySchema, type } from '@colyseus/schema';
import { BASE_CLAIM_RADIUS } from '../constants';
import { DEFAULT_CHARACTER } from '../types/shared';

export class Player extends Schema {
    @type('string') id: string = '';
    @type('string') name: string = '';
    @type('number') x: number = 0;
    @type('number') y: number = 0;
    @type('number') vx: number = 0; // px/sec — synced so clients can extrapolate smoothly between ticks
    @type('number') vy: number = 0;
    @type('number') angle: number = 0; // facing/aim direction in radians (world space)
    @type('number') health: number = 100;
    // Ammo, credits, gun, structure inventory and upgrades are all set from the chosen character's
    // starting kit when the match starts (CharacterSystem); these defaults only matter in the lobby.
    @type('number') ammo: number = 0;
    @type('number') tilesOwned: number = 0;
    @type('number') kills: number = 0;
    @type('number') score: number = 0; // computed by ScoreSystem: tiles + kills x 50 + structures
    @type('number') credits: number = 0;
    @type('number') claimRadius: number = BASE_CLAIM_RADIUS; // world px; larger once the Expander is owned
    @type('boolean') connected: boolean = true;
    @type('string') color: string = ''; // always the team's color (TEAMS in types/shared.ts)
    @type('string') teamId: string = ''; // a TeamId; players on the same team are allies
    @type('string') character: string = DEFAULT_CHARACTER; // a CharacterId, picked in the lobby
    @type('boolean') ready: boolean = false; // lobby only: the match starts when everyone is ready
    @type('string') gun: string = ''; // a GunId, or '' = unarmed (can't shoot)
    @type(['string']) structureInventory = new ArraySchema<string>(); // StructureTypes left to place
    @type(['string']) upgrades = new ArraySchema<string>(); // UpgradeIds owned, e.g. 'boost'
}

export class Tile extends Schema {
    @type('string') ownerId: string = ''; // empty string = unclaimed
}

export class Projectile extends Schema {
    @type('string') id: string = '';
    @type('string') ownerId: string = '';
    @type('number') x: number = 0;
    @type('number') y: number = 0;
    @type('number') angle: number = 0;
    @type('number') speed: number = 400; // on-screen pixels/sec (see SCREEN_Y_SCALE)
    @type('number') spawnedAt: number = 0; // server timestamp ms, for lifetime expiry
}

export class Structure extends Schema {
    @type('string') id: string = '';
    @type('string') ownerId: string = '';
    @type('number') tileX: number = 0;
    @type('number') tileY: number = 0;
    @type('string') type: string = 'fort'; // a StructureType; all types behave the same for now
    @type('number') health: number = 100;
    @type('number') maxHealth: number = 100;
}

export class GamePhaseState extends Schema {
    @type('string') phase: string = 'lobby'; // lobby | countdown | playing | results
    @type('number') endsAt: number = 0; // server timestamp ms
}

export class GameState extends Schema {
    @type({ map: Player }) players = new MapSchema<Player>();
    @type({ map: Structure }) structures = new MapSchema<Structure>();
    @type({ map: Projectile }) projectiles = new MapSchema<Projectile>();
    @type([Tile]) tiles = new ArraySchema<Tile>(); // flat array, index = y*width+x
    @type(GamePhaseState) phase = new GamePhaseState();
    @type('number') mapWidth: number = 64;
    @type('number') mapHeight: number = 64;
    @type('number') nextPayoutAt: number = 0; // server timestamp ms, next credit payout
}
