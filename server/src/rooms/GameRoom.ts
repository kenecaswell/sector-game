import { Room, Client } from 'colyseus';
import { StateView } from '@colyseus/schema';
import { GameState, MountainPiece, Player, Tile } from '../state/GameState';
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
import { UpgradeSystem } from '../systems/UpgradeSystem';
import { PickupSystem } from '../systems/PickupSystem';
import { BotSystem } from '../systems/BotSystem';
import { RespawnSystem, type Notify } from '../systems/RespawnSystem';
import { generatePickups } from '../pickups';
import { assignSpawn, generateTerrain, seededRandom } from '../terrain';
import type { Broadcast } from '../systems/Broadcast';
import {
    TICK_RATE,
    RECONNECT_WINDOW_SECONDS,
    SCREEN_Y_SCALE,
    PICKUPS_ENABLED,
    SPAWN_SLOTS,
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
    EquipUpgradeMessage,
    AddBotMessage,
    RemoveBotMessage,
    UpdateBotMessage,
} from '../types/shared';
import {
    MAP_SIZES,
    TERRAIN_THEME_IDS,
    normalizeGameSettings,
    type GamePhase,
    type MapSizeId,
} from '../types/shared';
import { uniqueGameCode, type GameMetadata } from '../games';

export class GameRoom extends Room<GameState> {
    // One seat per spawn slot; bots take seats too, so this drops as bots are added (syncBotSeats).
    maxClients = SPAWN_SLOTS;

    // Per-player transient state that shouldn't be synced to clients, so it
    // lives outside the Colyseus schema rather than as @type fields. NOT named
    // `inputs` — some Colyseus versions reserve that property name on Room.
    private playerInputs = new Map<string, PlayerInput>();
    private matchFinished = false;
    private closing = false;
    private listedPhase: GamePhase = 'lobby';

    private readonly broadcastEvent: Broadcast = (type, payload) => this.broadcast(type, payload);
    private readonly notifyPlayer: Notify = (playerId, type, payload) =>
        this.clients.find((c) => c.sessionId === playerId)?.send(type, payload);

    /**
     * A new game, with the settings from the Create game screen (`options.game`, cleaned up by
     * normalizeGameSettings; a plain joinOrCreate gets the defaults). Its code (the room id) is a
     * short one for URLs and the game list.
     */
    async onCreate(options?: JoinOptions): Promise<void> {
        this.roomId = await uniqueGameCode();
        const settings = normalizeGameSettings(options?.game);
        if (!settings.name) settings.name = `Game ${this.roomId}`;

        const state = new GameState();
        Object.assign(state.settings, settings);
        state.settings.pods = settings.pods && PICKUPS_ENABLED; // the server flag can veto pods
        state.mapWidth = MAP_SIZES[settings.mapSize].cols;
        state.mapHeight = MAP_SIZES[settings.mapSize].rows;
        // A fresh random layout for every match (the seed only matters for reproducing one).
        const random = seededRandom(Math.floor(Math.random() * 2 ** 32));
        const { terrain, features } = generateTerrain(state.mapWidth, state.mapHeight, random);
        for (let i = 0; i < state.mapWidth * state.mapHeight; i++) {
            const tile = new Tile();
            tile.terrain = terrain[i];
            state.tiles.push(tile);
        }
        // The terrain's color scheme for this match, at random (see TERRAIN_THEME_IDS).
        state.theme = TERRAIN_THEME_IDS[Math.floor(random() * TERRAIN_THEME_IDS.length)];
        // Which hexes make up each mountain, so clients can draw each one as a single sprite.
        for (const feature of features) {
            for (const piece of feature.pieces ?? []) {
                const mountain = new MountainPiece();
                mountain.size = piece.hexes.length;
                mountain.hexes.push(...piece.hexes.map((h) => h.row * state.mapWidth + h.col));
                state.mountains.push(mountain);
            }
        }
        // Drop pods (the game's setting, and the PICKUPS_ENABLED feature flag; see pickups.ts).
        if (state.settings.pods) {
            for (const spot of generatePickups(terrain, state.mapWidth, state.mapHeight, random)) {
                PickupSystem.addPod(state, spot);
            }
        }
        this.setState(state);
        this.updateListing();

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
        this.onMessage<EquipUpgradeMessage>('equipUpgrade', (client, msg) =>
            this.withPlayer(client, (p) => UpgradeSystem.equip(this.state, p, msg?.upgradeId))
        );
        // DEV ONLY (temporary): the M key. EconomySystem refuses it with NODE_ENV=production.
        this.onMessage('devMaterials', (client) =>
            this.withPlayer(client, (p) => EconomySystem.grantDevMaterials(this.state, p))
        );
        this.onMessage<PurchaseMessage>('purchase', (client, msg) =>
            this.handlePurchase(client, msg)
        );
        // Bots (lobby only; any player may manage them). See BotSystem.
        this.onMessage<AddBotMessage>('addBot', (client, msg) =>
            this.withPlayer(client, () => {
                if (BotSystem.add(this.state, msg?.difficulty)) this.syncBotSeats();
            })
        );
        this.onMessage<RemoveBotMessage>('removeBot', (client, msg) =>
            this.withPlayer(client, () => {
                if (BotSystem.remove(this.state, msg?.botId)) this.syncBotSeats();
            })
        );
        this.onMessage<UpdateBotMessage>('updateBot', (client, msg) =>
            this.withPlayer(client, () => BotSystem.configure(this.state, msg))
        );
    }

    /**
     * Bots fill spawn slots without being clients, so people get the seats that are left: the room
     * reports full (and locks itself) once people plus bots reach SPAWN_SLOTS. The game list counts
     * the bots from the metadata.
     */
    private syncBotSeats(): void {
        this.maxClients = SPAWN_SLOTS - BotSystem.botCount(this.state);
        this.updateListing();
    }

    onJoin(client: Client, options?: JoinOptions): void {
        // Each client has its own view of the state, so it's sent its own backpacks and nobody
        // else's (see showBackpacks). A reconnecting client keeps its view.
        client.view = new StateView();
        client.view.add(this.state);
        const player = new Player();
        player.id = client.sessionId;
        // The client sends its saved name; otherwise "Player N". Made unique among the others.
        player.name = LobbySystem.joiningName(this.state, options?.name);
        LobbySystem.setTeam(player, LobbySystem.defaultTeam(this.state));
        // Joining mid-match: there's no lobby to pick in, so play the default character. (Joining
        // during the countdown cancels it, since the newcomer isn't ready yet.)
        if (this.state.phase.phase === 'playing') CharacterSystem.apply(player);
        // Start on the spawn line at the east edge (see terrain.ts → spawnHex).
        assignSpawn(this.state, player);

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
        RespawnSystem.removeBackpacksOf(this.state, sessionId);
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

    /** Keeps the matchmaker's metadata (what GET /games lists) in step with the game. */
    private updateListing(): void {
        const { settings, phase } = this.state;
        void this.setMetadata({
            name: settings.name,
            mapSize: settings.mapSize as MapSizeId,
            teams: settings.teams,
            pods: settings.pods,
            matchMinutes: settings.matchMinutes,
            phase: phase.phase,
            bots: BotSystem.botCount(this.state),
        } satisfies GameMetadata);
        this.listedPhase = phase.phase;
    }

    private tick(dt: number): void {
        LobbySystem.update(this.state, this.broadcastEvent);
        BotSystem.update(this.state, this.playerInputs); // sets bots' inputs before anyone moves
        MovementSystem.update(this.state, this.playerInputs, dt);
        CollisionSystem.update(this.state, this.broadcastEvent);
        PickupSystem.update(this.state, this.broadcastEvent);
        RespawnSystem.update(this.state, this.notifyPlayer); // respawns, and backpacks taken back
        CombatSystem.update(this.state, dt, this.broadcastEvent);
        PhaseSystem.update(this.state, this.broadcastEvent);
        this.closeFinishedMatch();
        ScoreSystem.update(this.state);
        this.showBackpacks();
        if (this.state.phase.phase !== this.listedPhase) this.updateListing();
    }

    /**
     * Adds any new backpack to its owner's view, so only the owner's client receives it (a removed
     * one leaves every view by itself). Bots have no client, and need no view.
     */
    private showBackpacks(): void {
        this.state.backpacks.forEach((pack) => {
            const owner = this.clients.find((c) => c.sessionId === pack.ownerId);
            if (owner?.view && !owner.view.has(pack)) owner.view.add(pack);
        });
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
        if (player) CombatSystem.fire(this.state, player, msg?.angle);
    }

    /** From the player's structure inventory; the whole 7-hex footprint must be theirs and free. */
    private handlePlaceStructure(client: Client, msg: PlaceStructureMessage): void {
        const player = this.state.players.get(client.sessionId);
        if (player) {
            StructureSystem.place(this.state, player, msg?.structureType, msg?.tileX, msg?.tileY);
        }
    }

    /** Buying happens during the match only (there's no separate shopping phase). */
    private handlePurchase(client: Client, msg: PurchaseMessage): void {
        const player = this.state.players.get(client.sessionId);
        if (!player || !player.connected || this.state.phase.phase !== 'playing') return;

        ShopSystem.purchase(player, msg?.itemId);
    }
}
