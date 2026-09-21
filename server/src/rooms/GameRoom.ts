import { Room, Client } from 'colyseus';
import { GameState, Player, Tile, Projectile, Structure } from '../state/GameState';
import { MovementSystem, type PlayerInput } from '../systems/MovementSystem';
import { CollisionSystem } from '../systems/CollisionSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { PhaseSystem } from '../systems/PhaseSystem';
import { EconomySystem } from '../systems/EconomySystem';
import { ScoreSystem } from '../systems/ScoreSystem';
import { hexIndex, isValidHex, mapPixelSize } from '../hex';
import type { Broadcast } from '../systems/Broadcast';
import {
    TICK_RATE,
    RECONNECT_WINDOW_SECONDS,
    CREDIT_PAYOUT_INTERVAL_MS,
    SCREEN_Y_SCALE,
} from '../constants';
import type {
    InputMessage,
    ShootMessage,
    PlaceStructureMessage,
    InputAckEvent,
    GameOverEvent,
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
    private matchFinished = false;
    private closing = false;
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
        this.onMessage('endBuying', (client) => this.handleEndBuying(client));
    }

    onJoin(client: Client): void {
        const player = new Player();
        player.id = client.sessionId;
        player.name = `Player ${this.state.players.size + 1}`;
        player.color = PLAYER_COLORS[this.state.players.size % PLAYER_COLORS.length];
        const { width, height } = mapPixelSize(this.state.mapWidth, this.state.mapHeight);
        player.x = width / 2;
        player.y = height / 2;

        this.state.players.set(client.sessionId, player);

        // First joiner becomes host; a newcomer also takes over if the recorded
        // host is disconnected (they were kept only in case they reconnect).
        this.reassignHostIfNeeded();
    }

    async onLeave(client: Client, consented: boolean): Promise<void> {
        const player = this.state.players.get(client.sessionId);
        if (player) player.connected = false;

        // Don't wait out the reconnect window: a disconnected host can't send
        // startGame, so hand the role to someone who can.
        this.reassignHostIfNeeded();

        // Nobody needs a reconnect window once the match is over — let them go so the room can close.
        if (consented || this.state.phase.phase === 'results') {
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

        if (this.hostId === sessionId) this.hostId = null;
        this.reassignHostIfNeeded();
    }

    /**
     * Ensures the host is a connected player whenever one exists. If the current
     * host is connected, nothing changes. If not, the first connected player (join
     * order) takes over. If nobody is connected, a disconnected host is kept so
     * they get the role back by reconnecting — but the next player to join takes it.
     */
    private reassignHostIfNeeded(): void {
        const host = this.hostId === null ? undefined : this.state.players.get(this.hostId);
        if (host?.connected) return;

        const next = Array.from(this.state.players.values()).find((p) => p.connected);
        if (next) this.hostId = next.id;
    }

    /**
     * When the match ends: lock the room so matchmaking stops sending new players
     * into it, and close it once the results period is over. (It also closes as
     * soon as the last player leaves — see onLeave and Colyseus's autoDispose.)
     */
    private closeFinishedMatch(): void {
        if (this.state.phase.phase !== 'results') return;

        if (!this.matchFinished) {
            this.matchFinished = true;
            this.lock();
            ScoreSystem.update(this.state); // make sure the snapshot reflects the very last tick
            this.broadcast('gameOver', {
                scores: ScoreSystem.finalScores(this.state),
            } satisfies GameOverEvent);
        }
        if (!this.closing && Date.now() >= this.state.phase.endsAt) {
            this.closing = true;
            void this.disconnect();
        }
    }

    private tick(dt: number): void {
        MovementSystem.update(this.state, this.playerInputs, dt);
        CollisionSystem.update(this.state, this.broadcastEvent);
        CombatSystem.update(this.state, dt, this.broadcastEvent);
        PhaseSystem.update(this.state, this.broadcastEvent);
        this.closeFinishedMatch();
        EconomySystem.update(this.state);
        ScoreSystem.update(this.state);
    }

    private handleInput(client: Client, msg: InputMessage): void {
        const player = this.state.players.get(client.sessionId);
        if (!player || !player.connected) return;

        // Clamp so a buggy/malicious client can't send an oversized direction
        // vector and move faster than PLAYER_SPEED.
        // World-y may legitimately reach 1 / SCREEN_Y_SCALE (full speed straight up/down the screen);
        // MovementSystem clamps the vector's on-screen length, so this only rejects absurd values.
        const clampAxis = (value: unknown, limit: number): number =>
            typeof value === 'number' && Number.isFinite(value)
                ? Math.max(-limit, Math.min(limit, value))
                : 0;
        const dir = {
            x: clampAxis(msg.dir?.x, 1),
            y: clampAxis(msg.dir?.y, 1 / SCREEN_Y_SCALE),
        };
        this.playerInputs.set(client.sessionId, { dir, seq: msg.seq, receivedAt: Date.now() });

        // Facing is cosmetic (other players' clients draw it), so just sanitize it.
        if (typeof msg.angle === 'number' && Number.isFinite(msg.angle)) player.angle = msg.angle;

        // Echo the processed seq back to this client only, so it can discard
        // confirmed predicted moves during client-side reconciliation.
        client.send('inputAck', { seq: msg.seq } satisfies InputAckEvent);
    }

    private handleShoot(client: Client, msg: ShootMessage): void {
        const player = this.state.players.get(client.sessionId);
        if (!player || !player.connected || this.state.phase.phase !== 'playing') return;
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
        if (!player || !player.connected || this.state.phase.phase !== 'playing') return;

        // Validate first — an out-of-range column would otherwise wrap onto another row.
        if (!isValidHex(msg.tileX, msg.tileY, this.state.mapWidth, this.state.mapHeight)) return;
        const tile = this.state.tiles[hexIndex(msg.tileX, msg.tileY, this.state.mapWidth)];
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

    /**
     * TEMPORARY testing shortcut: the host can end the buying phase early (the client sends this when
     * they close the shop popup during buying) so a solo tester doesn't wait out the 30s. Host-only so
     * other players closing their popup can't start the match. Remove once the buy menu is real.
     */
    private handleEndBuying(client: Client): void {
        if (client.sessionId !== this.hostId) return;
        if (this.state.phase.phase !== 'buying') return;
        PhaseSystem.transitionTo(this.state, 'playing', this.broadcastEvent);
    }

    private handleStartGame(client: Client): void {
        if (client.sessionId !== this.hostId) return;
        if (this.state.phase.phase !== 'lobby') return;

        PhaseSystem.transitionTo(this.state, 'buying', this.broadcastEvent);
    }
}
