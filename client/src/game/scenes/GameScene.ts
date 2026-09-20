import Phaser from 'phaser';
import { getStateCallbacks, type GameRoom } from '../../net/GameConnection';
import type { PlayerState, ProjectileState, StructureState } from '../../types/gameState';
import {
  PLAYER_RADIUS,
  PROJECTILE_RADIUS,
  POSITION_LERP_FACTOR,
  TILE_SIZE,
  TILE_GRID_LINE_COLOR,
  UNCLAIMED_TILE_COLOR,
} from '../constants';

export interface GameSceneCallbacks {
  onInput: (dir: { x: number; y: number }) => void;
  onShoot: (angle: number) => void;
  onPlaceStructure: (tileX: number, tileY: number) => void;
}

export interface GameSceneInitData {
  room: GameRoom;
  sessionId: string;
  callbacks: GameSceneCallbacks;
}

/**
 * Reads room.state directly every frame for high-frequency gameplay data
 * (positions, tile ownership) rather than routing it through React —
 * see docs/technical-blueprint.md "Client — React Shell". Only entity
 * creation/removal uses Colyseus's reactive onAdd/onRemove callbacks, since
 * that's naturally event-driven rather than per-frame.
 */
export class GameScene extends Phaser.Scene {
  private room!: GameRoom;
  private sessionId = '';
  private callbacks!: GameSceneCallbacks;

  private tileGraphics!: Phaser.GameObjects.Graphics;
  private playerSprites = new Map<string, Phaser.GameObjects.Arc>();
  private projectileSprites = new Map<string, Phaser.GameObjects.Arc>();
  private structureSprites = new Map<string, Phaser.GameObjects.Rectangle>();

  private cursorKeys!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasdKeys!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };
  private buildMode = false;
  private lastInputSentAt = 0;
  private lastSentDir = { x: 0, y: 0 };

  constructor() {
    super('GameScene');
  }

  init(data: GameSceneInitData): void {
    this.room = data.room;
    this.sessionId = data.sessionId;
    this.callbacks = data.callbacks;
    this.buildMode = false;
  }

  create(): void {
    const { mapWidth, mapHeight } = this.room.state;
    const worldWidth = mapWidth * TILE_SIZE;
    const worldHeight = mapHeight * TILE_SIZE;

    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    this.cameras.main.setBackgroundColor(0x1a1a2e);

    this.tileGraphics = this.add.graphics();
    this.drawTiles();

    const $ = getStateCallbacks(this.room);

    $(this.room.state).players.onAdd((player) => this.addPlayerSprite(player));
    $(this.room.state).players.onRemove((_player, sessionId) => this.removePlayerSprite(sessionId));

    $(this.room.state).projectiles.onAdd((projectile) => this.addProjectileSprite(projectile));
    $(this.room.state).projectiles.onRemove((_projectile, id) => this.removeProjectileSprite(id));

    $(this.room.state).structures.onAdd((structure) => this.addStructureSprite(structure));
    $(this.room.state).structures.onRemove((_structure, id) => this.removeStructureSprite(id));

    // Existing entities at scene-create time (server sends full state on join,
    // and onAdd only fires for changes *after* the callback is registered).
    this.room.state.players.forEach((player) => this.addPlayerSprite(player));
    this.room.state.projectiles.forEach((projectile) => this.addProjectileSprite(projectile));
    this.room.state.structures.forEach((structure) => this.addStructureSprite(structure));

    this.room.onMessage('tilesClaimed', () => this.drawTiles());

    if (this.input.keyboard) {
      this.cursorKeys = this.input.keyboard.createCursorKeys();
      const keys = this.input.keyboard.addKeys('W,A,S,D') as Record<
        string,
        Phaser.Input.Keyboard.Key
      >;
      this.wasdKeys = { W: keys.W, A: keys.A, S: keys.S, D: keys.D };
    }

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) =>
      this.handlePointerDown(pointer)
    );
  }

  update(time: number): void {
    this.pollKeyboard(time);
    this.lerpEntityPositions();
  }

  /** Toggled by the React "Build" button so the next tap places a structure instead of shooting. */
  setBuildMode(active: boolean): void {
    this.buildMode = active;
  }

  private pollKeyboard(time: number): void {
    if (!this.cursorKeys) return;

    const dir = { x: 0, y: 0 };
    if (this.cursorKeys.left.isDown || this.wasdKeys?.A.isDown) dir.x -= 1;
    if (this.cursorKeys.right.isDown || this.wasdKeys?.D.isDown) dir.x += 1;
    if (this.cursorKeys.up.isDown || this.wasdKeys?.W.isDown) dir.y -= 1;
    if (this.cursorKeys.down.isDown || this.wasdKeys?.S.isDown) dir.y += 1;

    this.sendInputIfChanged(dir, time);
  }

  /** Also called by the mobile virtual joystick overlay via the scene's public API. */
  sendInputIfChanged(dir: { x: number; y: number }, time: number): void {
    const changed = dir.x !== this.lastSentDir.x || dir.y !== this.lastSentDir.y;
    const dueForResend = time - this.lastInputSentAt > 250; // keep-alive so the server doesn't stall on a dropped packet
    if (!changed && !dueForResend) return;

    this.lastSentDir = dir;
    this.lastInputSentAt = time;
    this.callbacks.onInput(dir);
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const tileX = Math.floor(world.x / TILE_SIZE);
    const tileY = Math.floor(world.y / TILE_SIZE);

    if (this.buildMode) {
      this.callbacks.onPlaceStructure(tileX, tileY);
      this.buildMode = false;
      return;
    }

    const me = this.room.state.players.get(this.sessionId);
    if (!me) return;
    const angle = Math.atan2(world.y - me.y, world.x - me.x);
    this.callbacks.onShoot(angle);
  }

  private drawTiles(): void {
    const { tiles, mapWidth, mapHeight, players } = this.room.state;
    this.tileGraphics.clear();

    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        const tile = tiles[y * mapWidth + x];
        const color = tile?.ownerId
          ? this.colorForOwner(tile.ownerId, players)
          : UNCLAIMED_TILE_COLOR;
        this.tileGraphics.fillStyle(color, tile?.ownerId ? 0.55 : 1);
        this.tileGraphics.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }

    this.tileGraphics.lineStyle(1, TILE_GRID_LINE_COLOR, 0.3);
    for (let x = 0; x <= mapWidth; x++) {
      this.tileGraphics.lineBetween(x * TILE_SIZE, 0, x * TILE_SIZE, mapHeight * TILE_SIZE);
    }
    for (let y = 0; y <= mapHeight; y++) {
      this.tileGraphics.lineBetween(0, y * TILE_SIZE, mapWidth * TILE_SIZE, y * TILE_SIZE);
    }
  }

  private colorForOwner(ownerId: string, players: ReadonlyMap<string, PlayerState>): number {
    const owner = players.get(ownerId);
    return owner ? Phaser.Display.Color.HexStringToColor(owner.color).color : UNCLAIMED_TILE_COLOR;
  }

  private addPlayerSprite(player: PlayerState): void {
    if (this.playerSprites.has(player.id)) return;
    const color = Phaser.Display.Color.HexStringToColor(player.color || '#ffffff').color;
    const isSelf = player.id === this.sessionId;
    const circle = this.add.circle(player.x, player.y, PLAYER_RADIUS, color);
    circle.setStrokeStyle(isSelf ? 3 : 1, 0xffffff, isSelf ? 1 : 0.6);
    this.playerSprites.set(player.id, circle);

    if (isSelf) this.cameras.main.startFollow(circle, true, 0.15, 0.15);
  }

  private removePlayerSprite(sessionId: string): void {
    this.playerSprites.get(sessionId)?.destroy();
    this.playerSprites.delete(sessionId);
  }

  private addProjectileSprite(projectile: ProjectileState): void {
    if (this.projectileSprites.has(projectile.id)) return;
    const circle = this.add.circle(projectile.x, projectile.y, PROJECTILE_RADIUS, 0xffe066);
    this.projectileSprites.set(projectile.id, circle);
  }

  private removeProjectileSprite(id: string): void {
    this.projectileSprites.get(id)?.destroy();
    this.projectileSprites.delete(id);
  }

  private addStructureSprite(structure: StructureState): void {
    if (this.structureSprites.has(structure.id)) return;
    const owner = this.room.state.players.get(structure.ownerId);
    const color = owner ? Phaser.Display.Color.HexStringToColor(owner.color).color : 0xffffff;
    const rect = this.add.rectangle(
      structure.tileX * TILE_SIZE + TILE_SIZE / 2,
      structure.tileY * TILE_SIZE + TILE_SIZE / 2,
      TILE_SIZE * 0.7,
      TILE_SIZE * 0.7,
      color
    );
    rect.setStrokeStyle(2, 0x000000, 0.5);
    this.structureSprites.set(structure.id, rect);
  }

  private removeStructureSprite(id: string): void {
    this.structureSprites.get(id)?.destroy();
    this.structureSprites.delete(id);
  }

  private lerpEntityPositions(): void {
    this.room.state.players.forEach((player, id) => {
      const sprite = this.playerSprites.get(id);
      if (!sprite) return;
      sprite.x = Phaser.Math.Linear(sprite.x, player.x, POSITION_LERP_FACTOR);
      sprite.y = Phaser.Math.Linear(sprite.y, player.y, POSITION_LERP_FACTOR);
      sprite.setVisible(player.connected || id === this.sessionId);
    });

    this.room.state.projectiles.forEach((projectile, id) => {
      const sprite = this.projectileSprites.get(id);
      if (!sprite) return;
      sprite.x = projectile.x;
      sprite.y = projectile.y;
    });
  }
}
