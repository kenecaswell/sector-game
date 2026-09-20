import { Room, Client } from 'colyseus';
import { GameState, Player, Tile, Projectile, Structure } from '../state/GameState';
import { MovementSystem, type PlayerInput } from '../systems/MovementSystem';
import { CollisionSystem } from '../systems/CollisionSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { PhaseSystem } from '../systems/PhaseSystem';
import { EconomySystem } from '../systems/EconomySystem';
import type { Broadcast } from '../systems/Broadcast';
import {
  TICK_RATE,
  TILE_SIZE,
  RECONNECT_WINDOW_SECONDS,
  CREDIT_PAYOUT_INTERVAL_MS,
} from '../constants';
import type {
  InputMessage,
  ShootMessage,
  PlaceStructureMessage,
  InputAckEvent,
} from '../types/shared';

const PLAYER_COLORS = [
  '#e74c3c',
  '#3498db',
  '#2ecc71',
  '#f1c40f',
  '#9b59b6',
  '#1abc9c',
  '#e67e22',
  '#95a5a6',
  '#34495e',
  '#ff7675',
];

export class GameRoom extends Room<GameState> {
  maxClients = 10;

  // Per-player transient state that shouldn't be synced to clients, so it
  // lives outside the Colyseus schema rather than as @type fields. NOT named
  // `inputs` — some Colyseus versions reserve that property name on Room.
  private playerInputs = new Map<string, PlayerInput>();
  private hostId: string | null = null;
  private nextProjectileId = 0;

  private readonly broadcastEvent: Broadcast = (type, payload) => this.broadcast(type, payload);

  onCreate(): void {
    const state = new GameState();
    for (let i = 0; i < state.mapWidth * state.mapHeight; i++) {
      state.tiles.push(new Tile());
    }
    state.nextPayoutAt = Date.now() + CREDIT_PAYOUT_INTERVAL_MS;
    this.setState(state);

    this.setSimulationInterval((dt) => this.tick(dt / 1000), 1000 / TICK_RATE);

    this.onMessage<InputMessage>('input', (client, msg) => this.handleInput(client, msg));
    this.onMessage<ShootMessage>('shoot', (client, msg) => this.handleShoot(client, msg));
    this.onMessage<PlaceStructureMessage>('placeStructure', (client, msg) =>
      this.handlePlaceStructure(client, msg)
    );
    this.onMessage('startGame', (client) => this.handleStartGame(client));
  }

  onJoin(client: Client): void {
    const player = new Player();
    player.id = client.sessionId;
    player.name = `Player ${this.state.players.size + 1}`;
    player.color = PLAYER_COLORS[this.state.players.size % PLAYER_COLORS.length];
    player.x = (this.state.mapWidth * TILE_SIZE) / 2;
    player.y = (this.state.mapHeight * TILE_SIZE) / 2;

    this.state.players.set(client.sessionId, player);

    if (this.hostId === null) this.hostId = client.sessionId;
  }

  async onLeave(client: Client, consented: boolean): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;

    if (consented) {
      this.cleanupPlayer(client.sessionId);
      return;
    }

    try {
      // Freezes the player entity in place — tiles/structures are retained
      // — while this client has a chance to reconnect.
      await this.allowReconnection(client, RECONNECT_WINDOW_SECONDS);
      const reconnected = this.state.players.get(client.sessionId);
      if (reconnected) reconnected.connected = true;
    } catch {
      // Reconnection window expired.
      this.cleanupPlayer(client.sessionId);
    }
  }

  onDispose(): void {
    // No external resources to release yet (no DB connections, timers, etc.)
  }

  private cleanupPlayer(sessionId: string): void {
    this.state.tiles.forEach((tile) => {
      if (tile.ownerId === sessionId) tile.ownerId = '';
    });
    this.state.players.delete(sessionId);
    this.playerInputs.delete(sessionId);

    if (this.hostId === sessionId) {
      const next = Array.from(this.state.players.values()).find((p) => p.connected);
      this.hostId = next ? next.id : null;
    }
  }

  private tick(dt: number): void {
    MovementSystem.update(this.state, this.playerInputs, dt);
    CollisionSystem.update(this.state, this.broadcastEvent);
    CombatSystem.update(this.state, dt, this.broadcastEvent);
    PhaseSystem.update(this.state, this.broadcastEvent);
    EconomySystem.update(this.state);
  }

  private handleInput(client: Client, msg: InputMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.connected) return;

    // Clamp so a buggy/malicious client can't send an oversized direction
    // vector and move faster than PLAYER_SPEED.
    const dir = {
      x: Math.max(-1, Math.min(1, msg.dir?.x ?? 0)),
      y: Math.max(-1, Math.min(1, msg.dir?.y ?? 0)),
    };
    this.playerInputs.set(client.sessionId, { dir, seq: msg.seq });

    // Echo the processed seq back to this client only, so it can discard
    // confirmed predicted moves during client-side reconciliation.
    client.send('inputAck', { seq: msg.seq } satisfies InputAckEvent);
  }

  private handleShoot(client: Client, msg: ShootMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.connected || this.state.phase.phase !== 'combat') return;
    if (player.ammo <= 0) return;

    player.ammo--;

    const projectile = new Projectile();
    projectile.id = `${client.sessionId}-${this.nextProjectileId++}`;
    projectile.ownerId = client.sessionId;
    projectile.x = player.x;
    projectile.y = player.y;
    projectile.angle = msg.angle;
    projectile.spawnedAt = Date.now();

    this.state.projectiles.set(projectile.id, projectile);
  }

  private handlePlaceStructure(client: Client, msg: PlaceStructureMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.connected || this.state.phase.phase !== 'combat') return;

    const idx = msg.tileY * this.state.mapWidth + msg.tileX;
    const tile = this.state.tiles[idx];
    if (!tile || tile.ownerId !== client.sessionId) return; // must place on a tile you own

    let occupied = false;
    this.state.structures.forEach((s) => {
      if (s.tileX === msg.tileX && s.tileY === msg.tileY) occupied = true;
    });
    if (occupied) return;

    const structure = new Structure();
    structure.id = `struct-${msg.tileX}-${msg.tileY}`;
    structure.ownerId = client.sessionId;
    structure.tileX = msg.tileX;
    structure.tileY = msg.tileY;

    this.state.structures.set(structure.id, structure);
  }

  private handleStartGame(client: Client): void {
    if (client.sessionId !== this.hostId) return;
    if (this.state.phase.phase !== 'lobby') return;

    PhaseSystem.transitionTo(this.state, 'claiming', this.broadcastEvent);
  }
}
