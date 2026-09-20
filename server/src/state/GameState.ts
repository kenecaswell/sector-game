import { Schema, MapSchema, ArraySchema, type } from '@colyseus/schema';

export class Player extends Schema {
  @type('string') id: string = '';
  @type('string') name: string = '';
  @type('number') x: number = 0;
  @type('number') y: number = 0;
  @type('number') health: number = 100;
  @type('number') ammo: number = 30;
  @type('number') tilesOwned: number = 0;
  @type('number') kills: number = 0;
  @type('boolean') connected: boolean = true;
  @type('string') color: string = '';
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
  @type('number') speed: number = 400; // pixels/sec
}

export class Structure extends Schema {
  @type('string') id: string = '';
  @type('string') ownerId: string = '';
  @type('number') tileX: number = 0;
  @type('number') tileY: number = 0;
  @type('number') health: number = 100;
  @type('number') maxHealth: number = 100;
}

export class GamePhaseState extends Schema {
  @type('string') phase: string = 'lobby'; // lobby | claiming | combat | results
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
}
