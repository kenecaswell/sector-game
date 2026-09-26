import { Room, Client } from 'colyseus';
import { GameState, Player, Tile, Projectile, Structure } from '../state/GameState';
import { MovementSystem, type PlayerInput } from '../systems/MovementSystem';
import { CollisionSystem } from '../systems/CollisionSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { PhaseSystem } from '../systems/PhaseSystem';
import { EconomySystem } from '../systems/EconomySystem';
import { ScoreSystem } from '../systems/ScoreSystem';
import { ShopSystem } from '../systems/ShopSystem';
import { LobbySystem } from '../systems/LobbySystem';
import { CharacterSystem } from '../systems/CharacterSystem';
import { StructureSystem } from '../systems/StructureSystem';
import { mapPixelSize } from '../hex';
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
    PlayerDisconnectedEvent,
    PlayerReconnectedEvent,
    PurchaseMessage,
    SelectTeamMessage,
    SelectCharacterMessage,
    SetReadyMessage,
    SetNameMessage,
    JoinOptions,
} from '../types/shared';
import { GUN_DAMAGE, isGunId, isStructureType } from '../types/shared';

export class GameRoom extends Room<GameState> {
    maxClients = 10;

    // Per-player transient state that shouldn't be synced to clients, so it
    // lives outside the Colyseus schema rather than as @type fields. NOT named
    // `inputs` — some Colyseus versions reserve that property name on Room.
    private playerInputs = new Map<string, PlayerInput>();
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
        this.onMessage<SelectTeamMessage>('selectTeam', (client, msg) =>
            this.withPlayer(client, (p) => LobbySystem.selectTeam(this.state, p, msg?.teamId))
        );
        this.onMessage<SelectCharacterMessage>('selectCharacter', (client, msg) =>
            this.withPlayer(client, (p) =>
                LobbySystem.selectCharacter(this.state, p, msg?.characterId)
            )
        );
        this.onMessage<SetReadyMessage>('setReady', (client, msg) =>
            this.withPlayer(client, (p) => LobbySystem.setReady(this.state, p, msg?.ready))
        );
        this.onMessage<SetNameMessage>('setName', (client, msg) =>
            this.withPlayer(client, (p) => LobbySystem.setName(this.state, p, msg?.name))
        );
        this.onMessage<PurchaseMessage>('purchase', (client, msg) =>
            this.handlePurchase(client, msg)
        );
    }

    onJoin(client: Client, options?: JoinOptions): void {
        const player = new Player();
        player.id = client.sessionId;
        // The client sends its saved name; otherwise "Player N". Made unique among the others.
        player.name = LobbySystem.joiningName(this.state, options?.name);
        LobbySystem.setTeam(player, LobbySystem.defaultTeam(this.state));
        // Joining mid-match: there's no lobby to pick in, so play the default character. (Joining
        // during the countdown cancels it, since the newcomer isn't ready yet.)
        if (this.state.phase.phase === 'playing') CharacterSystem.apply(player);
        const { width, height } = mapPixelSize(this.state.mapWidth, this.state.mapHeight);
        player.x = width / 2;
        player.y = height / 2;

        this.state.players.set(client.sessionId, player);
    }

    async onLeave(client: Client, consented: boolean): Promise<void> {
        const player = this.state.players.get(client.sessionId);
        if (player) player.connected = false;

        // Nobody needs a reconnect window once the match is over — let them go so the room can close.
        if (consented || this.state.phase.phase === 'results') {
            this.cleanupPlayer(client.sessionId);
            return;
        }

        // Tell everyone this player dropped (and that they can still come back).
        if (player) {
            this.broadcast('playerDisconnected', {
                playerId: player.id,
                name: player.name,
                reconnectWindowMs: RECONNECT_WINDOW_SECONDS * 1000,
            } satisfies PlayerDisconnectedEvent);
        }

        try {
            // Freezes the player entity in place — tiles/structures are retained
            // — while this client has a chance to reconnect.
            await this.allowReconnection(client, RECONNECT_WINDOW_SECONDS);
            const reconnected = this.state.players.get(client.sessionId);
            if (reconnected) {
                reconnected.connected = true;
                // Everyone else hears about it; the returning player knows already. `client` is the
                // old, closed connection, so find the new one by session id to leave it out.
                const returning = this.clients.find((c) => c.sessionId === reconnected.id);
                this.broadcast(
                    'playerReconnected',
                    {
                        playerId: reconnected.id,
                        name: reconnected.name,
                    } satisfies PlayerReconnectedEvent,
                    returning ? { except: returning } : undefined
                );
            }
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
    }

    /** Runs a lobby action for this client's player if they're here and connected. */
    private withPlayer(client: Client, action: (player: Player) => void): void {
        const player = this.state.players.get(client.sessionId);
        if (player?.connected) action(player);
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
        LobbySystem.update(this.state, this.broadcastEvent);
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
        if (player.gun === '' || player.ammo <= 0) return;

        player.ammo--;

        const projectile = new Projectile();
        projectile.id = `${client.sessionId}-${this.nextProjectileId++}`;
        projectile.ownerId = client.sessionId;
        projectile.x = player.x;
        projectile.y = player.y;
        projectile.angle = msg.angle;
        projectile.spawnedAt = Date.now();
        projectile.damage = GUN_DAMAGE[isGunId(player.gun) ? player.gun : 'basic'];

        this.state.projectiles.set(projectile.id, projectile);
    }

    private handlePlaceStructure(client: Client, msg: PlaceStructureMessage): void {
        const player = this.state.players.get(client.sessionId);
        if (!player || !player.connected || this.state.phase.phase !== 'playing') return;

        // Structures come out of the player's inventory (their character's starting kit, for now).
        if (!isStructureType(msg.structureType)) return;
        const slot = player.structureInventory.indexOf(msg.structureType);
        if (slot === -1) return;

        // The whole 7-hex footprint must be yours, on the map, and free.
        if (!StructureSystem.canPlace(this.state, client.sessionId, msg.tileX, msg.tileY)) return;

        const structure = new Structure();
        structure.id = `struct-${msg.tileX}-${msg.tileY}`;
        structure.ownerId = client.sessionId;
        structure.tileX = msg.tileX;
        structure.tileY = msg.tileY;
        structure.type = msg.structureType;

        player.structureInventory.splice(slot, 1);
        this.state.structures.set(structure.id, structure);
    }

    /** Buying happens during the match only (there's no separate shopping phase). */
    private handlePurchase(client: Client, msg: PurchaseMessage): void {
        const player = this.state.players.get(client.sessionId);
        if (!player || !player.connected || this.state.phase.phase !== 'playing') return;

        ShopSystem.purchase(player, msg?.itemId);
    }
}
