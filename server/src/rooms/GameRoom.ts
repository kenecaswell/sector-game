import { Room, Client } from 'colyseus';
import { GameState, Player, Tile } from '../state/GameState';
import { MovementSystem } from '../systems/MovementSystem';
import { CollisionSystem } from '../systems/CollisionSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { PhaseSystem } from '../systems/PhaseSystem';
import type { InputMessage, ShootMessage, PlaceStructureMessage } from '../types/shared';

const TICK_RATE = 20; // Hz
const RECONNECT_WINDOW_SECONDS = 180; // 3 minutes

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

export class GameRoom extends Room<{ state: GameState }> {
  maxClients = 10;

  onCreate(): void {
    const state = new GameState();
    for (let i = 0; i < state.mapWidth * state.mapHeight; i++) {
      state.tiles.push(new Tile());
    }
    this.setState(state);

    this.setSimulationInterval((dt) => this.tick(dt / 1000), 1000 / TICK_RATE);

    this.onMessage<InputMessage>('input', (client, msg) => this.handleInput(client, msg));
    this.onMessage<ShootMessage>('shoot', (client, msg) => this.handleShoot(client, msg));
    this.onMessage<PlaceStructureMessage>('placeStructure', (client, msg) =>
      this.handlePlaceStructure(client, msg)
    );
  }

  onJoin(client: Client): void {
    const player = new Player();
    player.id = client.sessionId;
    player.name = `Player ${this.state.players.size + 1}`;
    player.color = PLAYER_COLORS[this.state.players.size % PLAYER_COLORS.length];
    player.x = (this.state.mapWidth * 32) / 2;
    player.y = (this.state.mapHeight * 32) / 2;

    this.state.players.set(client.sessionId, player);
  }

  onDrop(client: Client): void {
    // Called on an unconsented disconnect (dropped connection). Freeze the
    // player entity in place — tiles/structures are retained — and open a
    // reconnection window. onLeave() fires when this window expires, or
    // onReconnect() fires if the player comes back in time.
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;

    this.allowReconnection(client, RECONNECT_WINDOW_SECONDS);
  }

  onReconnect(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = true;
  }

  onLeave(client: Client): void {
    // Fires for both a consented leave and an expired reconnection window —
    // either way the player is gone for good, so release their tiles.
    this.state.tiles.forEach((tile) => {
      if (tile.ownerId === client.sessionId) tile.ownerId = '';
    });
    this.state.players.delete(client.sessionId);
  }

  onDispose(): void {
    // No external resources to release yet (no DB connections, timers, etc.)
  }

  private tick(dt: number): void {
    MovementSystem.update(this.state, dt);
    CollisionSystem.update(this.state);
    CombatSystem.update(this.state, dt);
    PhaseSystem.update(this.state);
  }

  private handleInput(client: Client, msg: InputMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.connected) return;
    // TODO: store msg.dir / msg.seq for MovementSystem to consume next tick,
    // and echo the last-processed seq back to the client for reconciliation.
    void msg;
  }

  private handleShoot(client: Client, msg: ShootMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.connected || this.state.phase.phase !== 'combat') return;
    // TODO: spawn a Projectile in this.state.projectiles using msg.angle
    void msg;
  }

  private handlePlaceStructure(client: Client, msg: PlaceStructureMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || !player.connected || this.state.phase.phase !== 'combat') return;
    // TODO: validate tile is owned by player and unoccupied, then place a Structure
    void msg;
  }
}
