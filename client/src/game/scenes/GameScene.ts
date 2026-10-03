import Phaser from 'phaser';
import { getStateCallbacks, type GameRoom } from '../../net/GameConnection';
import type {
    BackpackState,
    PickupState,
    PlayerState,
    ProjectileState,
    StructureState,
} from '../../types/gameState';
import { drawDropPod, drawDropPodGlow } from '../pickups';
import { drawBackpack, drawBackpackRing } from '../backpack';
import { drawSpawnPad } from '../spawnPad';
import {
    DEEP_BANK_HEIGHT,
    SHALLOW_BANK_HEIGHT,
    drawMountain,
    groundColor,
    groundDetails,
    groundDust,
    hexSeed,
    mixColor,
    mountainModel,
    pebbles,
    rippleMarks,
    seededRandom,
    skyReflection,
} from '../terrainArt';
import { paletteFor, type TerrainPalette } from '../terrainPalettes';
import {
    GUN_DAMAGE,
    GUN_FIRE_INTERVAL_MS,
    STRUCTURE_SPECS,
    TERRAIN,
    footprintFor,
    inStructure,
    isGunId,
    isStructureType,
    structureHexes,
    type StructureType,
} from '../../types/shared';
import { projectileVelocity } from '../../../../shared/projectiles';
import { isShallowWater } from '../terrain';
import {
    BASE_CLAIM_RADIUS,
    BODY_LIFT,
    CLAIM_BLEND,
    CLAIM_BORDER_DARKEN,
    CLAIM_BORDER_WIDTH,
    BASE_TILE_SIZE,
    CLAIM_CHUNK_SIZE,
    CLAIM_RING_FILL_ALPHA,
    DISCONNECTED_ALPHA,
    CLAIM_RING_STROKE_ALPHA,
    EXTRAPOLATION_S,
    HEX_DEPTH,
    HEX_SIZE,
    INPUT_KEEPALIVE_MS,
    INPUT_SEND_INTERVAL_MS,
    ISO_SQUASH,
    MOVE_RELATIVE_TO_AIM,
    PLAYER_RADIUS,
    PROJECTILE_RADIUS,
    BASIC_SHOT_COLORS,
    BASIC_SHOT_SCALE,
    BIG_SHOT_COLORS,
    BIG_SHOT_SCALE,
    SMOOTHING_RATE,
    SNAP_DISTANCE,
    STRUCTURE_BORDER_WIDTH,
    STRUCTURE_COLORS,
    STRUCTURE_DEFAULT_COLOR,
    STRUCTURE_HEIGHT,
    STRUCTURE_SIDE_DARKEN,
    BUILD_PREVIEW_OK_COLOR,
    BUILD_PREVIEW_BAD_COLOR,
    BUILD_PREVIEW_TAP_MS,
    TARGET_ARRIVE_DISTANCE,
    TARGET_MARKER_COLOR,
    TARGET_SLOW_DISTANCE,
    TARGET_STUCK_MS,
    UNIFORM_SCREEN_SPEED,
    PICKUP_BOB,
    PICKUP_BOB_MS,
    PICKUP_LIFT,
    PICKUP_SCALE,
    BACKPACK_LIFT,
    BACKPACK_RING_MS,
    BACKPACK_SCALE,
    POD_GLOW_MS,
} from '../constants';
import {
    hexCenter,
    hexCorners,
    hexIndex,
    hexNeighbors,
    isValidHex,
    mapPixelSize,
    nearestCompactRotation,
    structureCorners,
    pixelToHex,
    project,
    unproject,
    type Point,
} from '../hex';

export interface GameSceneCallbacks {
    onInput: (dir: { x: number; y: number }, angle: number) => void;
    onShoot: (angle: number) => void;
    onPlaceStructure: (tileX: number, tileY: number, rotation: number) => void;
}

export interface GameSceneInitData {
    room: GameRoom;
    sessionId: string;
    callbacks: GameSceneCallbacks;
}

// A rendered entity remembers its smoothed *world* (top-down) position; the
// Phaser object itself sits at the projected screen position.
interface PlayerView {
    container: Phaser.GameObjects.Container;
    nose: Phaser.GameObjects.Arc;
    color: number;
    // Tinted circle on the ground showing the claim radius; exists only while the player owns the
    // Expander. A separate scene object (not part of `container`) so it sits under every entity.
    ring: Phaser.GameObjects.Ellipse | null;
    ringRadius: number;
    // Their spawn platform, on the ground at the hex they start and respawn on.
    pad: Phaser.GameObjects.Graphics;
    wx: number;
    wy: number;
}

interface ProjectileView {
    sprite: Phaser.GameObjects.Container;
    wx: number;
    wy: number;
}

/** Registry key destroyPhaserGame sets: the game is going, so its scene stops listening to the room. */
export const GAME_DISPOSED_KEY = 'disposed';

const AIM_MIN_DISTANCE = 6; // world px — closer than this to the player, keep the previous aim

/**
 * Renders the room's state in an isometric view of a hex map.
 *
 * Coordinate spaces (see game/hex.ts):
 *  - world:  top-down, what the server simulates and what state.x/y mean.
 *  - scene:  what Phaser draws — world with y squashed by ISO_SQUASH.
 * Anything read from the server is world-space and gets `project`ed before it
 * touches a Phaser object; anything read from the pointer/joystick gets
 * `unproject`ed before it goes to the server.
 *
 * Reads room.state directly every frame for high-frequency gameplay data
 * (positions, tile ownership) rather than routing it through React —
 * see docs/ARCHITECTURE.md "Client — React Shell". Only entity
 * creation/removal uses Colyseus's reactive onAdd/onRemove callbacks, since
 * that's naturally event-driven rather than per-frame.
 */
export class GameScene extends Phaser.Scene {
    private room!: GameRoom;
    // The match's terrain colors (Slate or Titan: GameState.theme, picked by the server).
    private palette!: TerrainPalette;
    private sessionId = '';
    private callbacks!: GameSceneCallbacks;

    // Terrain is baked into textures. A Graphics object re-runs its whole command list every
    // frame, so drawing 4,096 hexes that way cost ~50ms per frame (~19fps); a baked texture is
    // one quad per frame.
    // Static hex terrain, baked once, in tiles of at most BASE_TILE_SIZE px: one texture for a whole
    // Big or Large map would exceed the maximum texture size of some GPUs (phones especially).
    private baseTiles: Phaser.GameObjects.RenderTexture[] = [];
    // Ownership tint, in square chunks so a claim re-bakes only the chunk(s) it touches (bounded
    // cost) instead of every claimed hex on the map, and off-screen chunks are culled.
    private claimChunks: Phaser.GameObjects.RenderTexture[] = [];
    private chunkHexes: number[][] = []; // hex indices overlapping each chunk
    private hexChunks: number[][] = []; // chunk indices overlapping each hex
    private renderedOwners: string[] = []; // owner each hex was last drawn with, to find what changed
    private claimScratch!: Phaser.GameObjects.Graphics; // reused for every chunk bake
    private hoverGraphics!: Phaser.GameObjects.Graphics; // outline of the hex under the cursor
    private hoverKey = ''; // which hex/mode the hover outline currently shows
    // Corner points as Vector2s because Graphics.fillPoints/strokePoints are typed for them.
    private hexCornerCache: Phaser.Math.Vector2[][] = [];
    private claimsDirty = true;

    private playerViews = new Map<string, PlayerView>();
    private projectileViews = new Map<string, ProjectileView>();
    private structureSprites = new Map<string, Phaser.GameObjects.Graphics>();
    private pickupViews = new Map<string, Phaser.GameObjects.Container>();
    private backpackViews = new Map<string, Phaser.GameObjects.Container>(); // only ever your own
    // Touch has no hover, so a refused build tap shows its red outline here for a moment.
    private tapPreview: {
        col: number;
        row: number;
        rotation: number;
        until: number;
    } | null = null;

    private cursorKeys!: Phaser.Types.Input.Keyboard.CursorKeys;
    private wasdKeys!: {
        W: Phaser.Input.Keyboard.Key;
        A: Phaser.Input.Keyboard.Key;
        S: Phaser.Input.Keyboard.Key;
        D: Phaser.Input.Keyboard.Key;
    };
    private buildMode = false;
    private buildType: StructureType = 'farm'; // what build mode is placing (sets the outline)

    private spaceKey?: Phaser.Input.Keyboard.Key;
    private fireHeld = false; // set by the mobile fire button
    private lastShotAt = -Infinity;

    // Right-click destination (world space). Cleared on arrival, when blocked, or when the player
    // takes over with the keyboard/joystick.
    private moveTarget: Point | null = null;
    private targetBestDistance = Infinity;
    private targetProgressAt = 0;
    private targetMarker!: Phaser.GameObjects.Ellipse;

    private aimAngle = 0; // world-space radians; where "forward" points
    private joystick = { x: 0, y: 0 }; // raw screen-space stick deflection, each axis -1..1

    private lastInputSentAt = 0;
    private lastSentDir = { x: 0, y: 0 };
    private lastSentAngle = 0;

    constructor() {
        super('GameScene');
    }

    init(data: GameSceneInitData): void {
        this.room = data.room;
        this.sessionId = data.sessionId;
        this.callbacks = data.callbacks;
        this.buildMode = false;
        this.fireHeld = false;
        this.lastShotAt = -Infinity;
        this.moveTarget = null;
        this.claimsDirty = true;
        this.hexCornerCache = [];
        this.claimChunks = [];
        this.chunkHexes = [];
        this.hexChunks = [];
        this.renderedOwners = [];
        this.hoverKey = '';
        this.playerViews.clear();
        this.projectileViews.clear();
        this.structureSprites.clear();
        this.pickupViews.clear();
        this.backpackViews.clear();
        this.tapPreview = null;
        this.joystick = { x: 0, y: 0 };
    }

    create(): void {
        const { mapWidth, mapHeight } = this.room.state;
        const world = mapPixelSize(mapWidth, mapHeight);

        // Deliberately no camera bounds: the camera always centers on your player, even at the
        // map's edge (showing empty space beyond it), so you can never walk off the screen.
        this.palette = paletteFor(this.room.state.theme);
        this.cameras.main.setBackgroundColor(this.palette.background);

        const layerWidth = Math.ceil(world.width) + 1;
        const layerHeight = Math.ceil(world.height * ISO_SQUASH + HEX_DEPTH) + 1;
        this.baseTiles = [];
        for (let y = 0; y < layerHeight; y += BASE_TILE_SIZE) {
            for (let x = 0; x < layerWidth; x += BASE_TILE_SIZE) {
                const w = Math.min(BASE_TILE_SIZE, layerWidth - x);
                const h = Math.min(BASE_TILE_SIZE, layerHeight - y);
                const tile = this.add.renderTexture(x, y, w, h).setOrigin(0, 0).setDepth(-3);
                this.baseTiles.push(tile);
            }
        }
        this.hoverGraphics = this.add.graphics().setDepth(-1);
        // A ring on the ground where a right-click told the player to go.
        this.targetMarker = this.add.ellipse(0, 0, HEX_SIZE * 1.2, HEX_SIZE * 1.2 * ISO_SQUASH);
        this.targetMarker
            .setStrokeStyle(2, TARGET_MARKER_COLOR, 0.9)
            .setDepth(-0.5)
            .setVisible(false);
        this.buildHexCornerCache();
        this.drawBase();
        this.buildMountains();
        this.addWaterSparkles();
        this.buildClaimChunks(layerWidth, layerHeight);

        const $ = getStateCallbacks(this.room);

        // The room outlives this scene, so every room listener is detached when the game goes:
        // otherwise a dead scene still gets the room's changes and throws. Phaser only tears a game
        // down on its next frame, and one destroyed while still booting (React StrictMode's
        // throwaway first mount in dev) never does, so destroyPhaserGame also flags the game as
        // disposed in its registry, which detaches at once (or never attaches, if it came first).
        const detach: Array<() => void> = [];
        const detachAll = () => detach.splice(0).forEach((stop) => stop());
        const attach = () => {
            detach.push(
                $(this.room.state).players.onAdd((player) => this.addPlayerView(player)),
                $(this.room.state).players.onRemove((_player, sessionId) => {
                    this.removePlayerView(sessionId);
                    this.claimsDirty = true; // a departing player's tiles are released without a tilesClaimed event
                }),
                $(this.room.state).projectiles.onAdd((projectile) =>
                    this.addProjectileView(projectile)
                ),
                $(this.room.state).projectiles.onRemove((_projectile, id) =>
                    this.removeProjectileView(id)
                ),
                $(this.room.state).structures.onAdd((structure) =>
                    this.addStructureSprite(structure)
                ),
                $(this.room.state).structures.onRemove((_structure, id) =>
                    this.removeStructureSprite(id)
                ),
                $(this.room.state).pickups.onAdd((pickup) => this.addPickupView(pickup)),
                $(this.room.state).pickups.onRemove((_pickup, id) => this.removePickupView(id)),
                // The server sends each client only its own backpacks.
                $(this.room.state).backpacks.onAdd((pack) => this.addBackpackView(pack)),
                $(this.room.state).backpacks.onRemove((_pack, id) => this.removeBackpackView(id)),
                this.room.onMessage('tilesClaimed', () => {
                    this.claimsDirty = true;
                })
            );
        };
        if (!this.registry.get(GAME_DISPOSED_KEY)) attach();
        this.registry.events.on('setdata', (_parent: unknown, key: string) => {
            if (key === GAME_DISPOSED_KEY) detachAll();
        });
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, detachAll);
        this.events.once(Phaser.Scenes.Events.DESTROY, detachAll);

        // Existing entities at scene-create time (server sends full state on join,
        // and onAdd only fires for changes *after* the callback is registered).
        this.room.state.players.forEach((player) => this.addPlayerView(player));
        this.room.state.projectiles.forEach((projectile) => this.addProjectileView(projectile));
        this.room.state.structures.forEach((structure) => this.addStructureSprite(structure));
        this.room.state.pickups.forEach((pickup) => this.addPickupView(pickup));
        this.room.state.backpacks.forEach((pack) => this.addBackpackView(pack));

        if (this.input.keyboard) {
            this.cursorKeys = this.input.keyboard.createCursorKeys();
            const keys = this.input.keyboard.addKeys('W,A,S,D') as Record<
                string,
                Phaser.Input.Keyboard.Key
            >;
            this.wasdKeys = { W: keys.W, A: keys.A, S: keys.S, D: keys.D };
            this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
        }

        this.input.mouse?.disableContextMenu(); // right-click is a game control, not a browser menu

        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) =>
            this.handlePointerDown(pointer)
        );
    }

    update(time: number, delta: number): void {
        const dt = delta / 1000;

        this.updateAim();
        this.pollInput(time);
        this.updateFiring();
        this.updateEntities(dt);

        if (this.claimsDirty) {
            this.claimsDirty = false;
            this.syncClaims();
        }
        this.drawHover();
    }

    /**
     * Set by React: while on, the next tap places a structure of `type` instead of shooting (the
     * outline under the pointer is that type's footprint).
     */
    setBuildMode(active: boolean, type: StructureType = this.buildType): void {
        this.buildMode = active;
        this.buildType = type;
    }

    /**
     * How to turn the structure being placed: a 3-hex structure (the Guard Tower) takes the clump
     * around the hex nearest the pointer's corner; a 7-hex one has only one way to sit.
     */
    private buildRotation(col: number, row: number, at: Point): number {
        return STRUCTURE_SPECS[this.buildType].hexes === 3
            ? nearestCompactRotation(col, row, at.x, at.y)
            : 0;
    }

    /** Called by the mobile fire button: while held, shoots along the current aim at the gun's fire interval. */
    setFireHeld(held: boolean): void {
        this.fireHeld = held;
    }

    /**
     * Called by the mobile virtual joystick overlay. `dir` is the stick
     * deflection in *screen* space (each axis -1..1); the scene converts it to a
     * world-space direction so the character walks where the stick points on screen.
     */
    setJoystick(dir: { x: number; y: number }): void {
        this.joystick = dir;
    }

    // --- Input -------------------------------------------------------------

    /** Points `aimAngle` from the local player toward the mouse (desktop only). */
    private updateAim(): void {
        const pointer = this.input.activePointer;
        if (pointer.wasTouch) return; // touch aims from the joystick / tap targets instead

        const me = this.playerViews.get(this.sessionId);
        if (!me) return;

        const target = this.pointerToWorld(pointer);
        const dx = target.x - me.wx;
        const dy = target.y - me.wy;
        if (Math.hypot(dx, dy) < AIM_MIN_DISTANCE) return;
        this.aimAngle = Math.atan2(dy, dx);
    }

    private pollInput(time: number): void {
        let dir: { x: number; y: number };

        if (this.joystick.x !== 0 || this.joystick.y !== 0) {
            this.clearMoveTarget();
            dir = this.joystickToWorld(this.joystick);
            if (dir.x !== 0 || dir.y !== 0) this.aimAngle = Math.atan2(dir.y, dir.x);
        } else {
            dir = this.keyboardToWorld();
            if (dir.x !== 0 || dir.y !== 0) {
                this.clearMoveTarget(); // pressing a movement key takes control back
            } else {
                dir = this.targetToInput();
            }
        }

        this.sendInputIfChanged(dir, this.aimAngle, time);
    }

    /**
     * WASD/arrows -> world-space direction. By default each key is a fixed
     * on-screen direction (W = up the screen, D = right, ...), combined and
     * normalized so diagonals aren't faster. The mouse only aims. With
     * MOVE_RELATIVE_TO_AIM, "forward" is instead wherever the mouse points and
     * A/D strafe.
     */
    private keyboardToWorld(): { x: number; y: number } {
        if (!this.cursorKeys) return { x: 0, y: 0 };

        let forward = 0;
        let right = 0;
        if (this.cursorKeys.up.isDown || this.wasdKeys?.W.isDown) forward += 1;
        if (this.cursorKeys.down.isDown || this.wasdKeys?.S.isDown) forward -= 1;
        if (this.cursorKeys.right.isDown || this.wasdKeys?.D.isDown) right += 1;
        if (this.cursorKeys.left.isDown || this.wasdKeys?.A.isDown) right -= 1;
        if (forward === 0 && right === 0) return { x: 0, y: 0 };

        // Work out the desired direction as it appears on screen.
        let screen: { x: number; y: number };
        if (MOVE_RELATIVE_TO_AIM) {
            const fx = Math.cos(this.aimAngle);
            const fy = Math.sin(this.aimAngle);
            // "Right" of forward: rotate +90° in y-down space (clockwise on screen).
            screen = project(fx * forward + -fy * right, fy * forward + fx * right);
        } else {
            screen = { x: right, y: -forward };
        }

        const length = Math.hypot(screen.x, screen.y);
        return length > 0
            ? this.screenDirToInput(screen.x / length, screen.y / length)
            : { x: 0, y: 0 };
    }

    private joystickToWorld(stick: { x: number; y: number }): { x: number; y: number } {
        return this.screenDirToInput(stick.x, stick.y); // length (0..1) is preserved as analog speed
    }

    /**
     * Converts an on-screen direction (length 0..1 = fraction of top speed) into the
     * world-space vector the server expects as `input.dir`.
     *
     * With UNIFORM_SCREEN_SPEED the vector is simply `unproject`ed, so a full-strength
     * push up the screen has world-y up to 1/ISO_SQUASH and looks as fast as one
     * sideways. Otherwise the same heading is sent with world length = strength,
     * i.e. equal world speed in every direction.
     */
    private screenDirToInput(sx: number, sy: number): { x: number; y: number } {
        const length = Math.hypot(sx, sy);
        if (length === 0) return { x: 0, y: 0 };
        const strength = Math.min(1, length);
        const world = unproject(sx / length, sy / length); // unit on screen
        if (UNIFORM_SCREEN_SPEED) return { x: world.x * strength, y: world.y * strength };

        const worldLength = Math.hypot(world.x, world.y);
        return { x: (world.x / worldLength) * strength, y: (world.y / worldLength) * strength };
    }

    private sendInputIfChanged(dir: { x: number; y: number }, angle: number, time: number): void {
        const elapsed = time - this.lastInputSentAt;
        if (elapsed < INPUT_SEND_INTERVAL_MS) return;

        const dirChanged =
            Math.abs(dir.x - this.lastSentDir.x) > 0.02 ||
            Math.abs(dir.y - this.lastSentDir.y) > 0.02;
        const angleChanged = Math.abs(angle - this.lastSentAngle) > 0.03;
        if (!dirChanged && !angleChanged && elapsed < INPUT_KEEPALIVE_MS) return;

        this.lastSentDir = dir;
        this.lastSentAngle = angle;
        this.lastInputSentAt = time;
        this.callbacks.onInput(dir, angle);
    }

    private handlePointerDown(pointer: Phaser.Input.Pointer): void {
        const target = this.pointerToWorld(pointer);

        if (pointer.rightButtonDown()) {
            this.setMoveTarget(target);
            return;
        }

        if (this.buildMode) {
            const { col, row } = pixelToHex(target.x, target.y);
            const rotation = this.buildRotation(col, row, target);
            if (this.canPlaceStructure(col, row, rotation)) {
                this.callbacks.onPlaceStructure(col, row, rotation);
                this.buildMode = false;
            } else if (pointer.wasTouch) {
                // Stay in build mode and show why: the outline turns red for a moment.
                this.tapPreview = {
                    col,
                    row,
                    rotation,
                    until: performance.now() + BUILD_PREVIEW_TAP_MS,
                };
            }
            return;
        }

        const me = this.playerViews.get(this.sessionId);
        if (!me) return;

        // A click/tap shoots toward the pointer. On touch there's no mouse to aim
        // with, so the tap also becomes the aim the fire button uses afterwards.
        const angle = Math.atan2(target.y - me.wy, target.x - me.wx);
        this.aimAngle = angle;
        this.tryShoot(angle);
    }

    private setMoveTarget(target: Point): void {
        this.moveTarget = target;
        this.targetBestDistance = Infinity;
        this.targetProgressAt = this.game.loop.time;

        const at = project(target.x, target.y);
        this.targetMarker.setPosition(at.x, at.y).setVisible(true);
    }

    private clearMoveTarget(): void {
        if (!this.moveTarget) return;
        this.moveTarget = null;
        this.targetMarker.setVisible(false);
    }

    /**
     * The input vector that walks the local player toward the right-click target, or zero (and the
     * target is cleared) once they arrive or stop making progress — e.g. the spot is inside a
     * structure they can't enter, or off the map.
     */
    private targetToInput(): { x: number; y: number } {
        if (!this.moveTarget) return { x: 0, y: 0 };
        const me = this.playerViews.get(this.sessionId);
        if (!me) return { x: 0, y: 0 };

        const dx = this.moveTarget.x - me.wx;
        const dy = this.moveTarget.y - me.wy;
        const distance = Math.hypot(dx, dy);
        if (distance < TARGET_ARRIVE_DISTANCE) {
            this.clearMoveTarget();
            return { x: 0, y: 0 };
        }

        const now = this.game.loop.time;
        if (distance < this.targetBestDistance - 4) {
            this.targetBestDistance = distance;
            this.targetProgressAt = now;
        } else if (now - this.targetProgressAt > TARGET_STUCK_MS) {
            this.clearMoveTarget();
            return { x: 0, y: 0 };
        }

        // Head toward it as it appears on screen, easing off close in so we stop on the spot.
        const screen = project(dx, dy);
        const length = Math.hypot(screen.x, screen.y);
        const strength = Math.min(1, distance / TARGET_SLOW_DISTANCE);
        return this.screenDirToInput(
            (screen.x / length) * strength,
            (screen.y / length) * strength
        );
    }

    /** Space (or the mobile fire button) held down: shoot along the current aim. */
    private updateFiring(): void {
        if (this.spaceKey?.isDown || this.fireHeld) this.tryShoot(this.aimAngle);
    }

    /** Sends a shot unless it's on cooldown, outside the match, unarmed or out of ammo (the server enforces the last three too). */
    private tryShoot(angle: number): void {
        const now = performance.now();
        if (this.room.state.phase.phase !== 'playing') return;
        const me = this.room.state.players.get(this.sessionId);
        if (!me || me.gun === '' || me.ammo <= 0) return;
        if (now - this.lastShotAt < GUN_FIRE_INTERVAL_MS[isGunId(me.gun) ? me.gun : 'basic'])
            return;

        this.lastShotAt = now;
        this.callbacks.onShoot(angle);
    }

    /** Pointer -> world (top-down) coordinates, accounting for camera scroll and the iso squash. */
    private pointerToWorld(pointer: Phaser.Input.Pointer): Point {
        const scenePoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        return unproject(scenePoint.x, scenePoint.y);
    }

    // --- Terrain -----------------------------------------------------------

    private buildHexCornerCache(): void {
        const { mapWidth, mapHeight } = this.room.state;
        for (let row = 0; row < mapHeight; row++) {
            for (let col = 0; col < mapWidth; col++) {
                this.hexCornerCache[hexIndex(col, row, mapWidth)] = hexCorners(col, row).map(
                    (corner) => new Phaser.Math.Vector2(corner.x, corner.y)
                );
            }
        }
    }

    /**
     * Bakes the terrain into the base layer once: every hex's cliff face and top (colored by its
     * terrain), back (top of screen) to front so a nearer tile's top covers the face of the tile
     * behind it. Ground hexes outline only edges shared with other ground. A second pass adds the
     * details of mountain hexes (scree) and water (its bed, ripples, banks and foam; see
     * drawWaterDetails). The mountains themselves are sprites (buildMountains), and claim tints are
     * separate chunked layers (syncClaims), so this never has to be redrawn.
     */
    private drawBase(): void {
        const { mapWidth, mapHeight, tiles } = this.room.state;
        const { liquid } = this.palette;
        const terrainAt = (col: number, row: number): number =>
            isValidHex(col, row, mapWidth, mapHeight)
                ? (tiles[hexIndex(col, row, mapWidth)]?.terrain ?? TERRAIN.ground)
                : TERRAIN.ground;
        const isWater = (col: number, row: number) => terrainAt(col, row) === TERRAIN.water;
        // Shallow (wadeable) water is derived from its shape, the same way the server decides it.
        const shallow = (col: number, row: number) => isShallowWater(isWater, col, row);
        // Ground is slate with drifts of brown and maroon dust (terrainArt.groundColor). Deep water
        // darkens toward the middle of a lake (more water around it), with a little variation hex
        // to hex so a lake isn't one flat color.
        const topColor = (terrain: number, col: number, row: number, center: Point): number => {
            const index = hexIndex(col, row, mapWidth);
            if (terrain === TERRAIN.mountain) return this.palette.scree;
            if (terrain !== TERRAIN.water) return groundColor(center, index, this.palette);
            // Shallow liquid is one flat color of its own, so it's never mistaken for deep.
            if (shallow(col, row)) return liquid.shallow;
            const wet = hexNeighbors(col, row).filter((n) => isWater(n.col, n.row)).length;
            const jitter = seededRandom(hexSeed(index, 1))() * 0.15;
            const deep = mixColor(liquid.deep, liquid.deepDark, (wet / 6) * 0.6 + jitter);
            // Deep liquid mirrors the sky in smooth patches across a lake (skyReflection), so
            // neighboring hexes gleam together; how much depends on the palette (none for Slate).
            return mixColor(deep, liquid.reflection, skyReflection(center) * liquid.deepGleam);
        };

        const order: Array<{ col: number; row: number; center: Point }> = [];
        for (let row = 0; row < mapHeight; row++) {
            for (let col = 0; col < mapWidth; col++) {
                const c = hexCenter(col, row);
                order.push({ col, row, center: project(c.x, c.y) });
            }
        }
        order.sort((a, b) => a.center.y - b.center.y || a.col - b.col);

        // How far a hex's drawing reaches from its center (scene px), to find the hexes each tile
        // needs: its top, and below it the cliff face and a bank.
        const halfHeight = ((HEX_SIZE * Math.sqrt(3)) / 2) * ISO_SQUASH;
        const reachUp = halfHeight + 2;
        const reachDown = halfHeight + HEX_DEPTH + DEEP_BANK_HEIGHT + 2;
        const reachSide = HEX_SIZE + 2;

        // Each tile is baked from a drawing of only the hexes that touch it (one drawing of the whole
        // map, replayed into every tile, would cost several times as much on a Big or Large map).
        for (const tile of this.baseTiles) {
            const g = this.make.graphics({}, false);
            const hexes = order.filter(
                ({ center }) =>
                    center.x + reachSide >= tile.x &&
                    center.x - reachSide <= tile.x + tile.width &&
                    center.y + reachDown >= tile.y &&
                    center.y - reachUp <= tile.y + tile.height
            );

            for (const { col, row, center } of hexes) {
                const corners = this.hexCornerCache[hexIndex(col, row, mapWidth)];
                const terrain = terrainAt(col, row);

                // Only the three lower edges (right, bottom, left) show a cliff face.
                for (let i = 0; i < 3; i++) {
                    const a = corners[i];
                    const b = corners[i + 1];
                    g.fillStyle(i === 1 ? this.palette.cliffDark : this.palette.cliff, 1);
                    g.fillPoints(
                        [
                            a,
                            b,
                            new Phaser.Math.Vector2(b.x, b.y + HEX_DEPTH),
                            new Phaser.Math.Vector2(a.x, a.y + HEX_DEPTH),
                        ],
                        true
                    );
                }

                g.fillStyle(topColor(terrain, col, row, center), 1);
                g.fillPoints(corners, true);
                if (terrain === TERRAIN.water) {
                    this.drawBanks(g, col, row, corners, shallow(col, row), isWater);
                }
                if (terrain !== TERRAIN.ground) continue; // its details come in the second pass
                this.drawGroundDetails(g, col, row, corners, center);
                g.lineStyle(1, this.palette.outline, 0.6);
                this.forEachEdge(col, row, corners, (a, b, neighbor) => {
                    if (terrainAt(neighbor.col, neighbor.row) === TERRAIN.ground)
                        g.lineBetween(a.x, a.y, b.x, b.y);
                });
            }

            // Second pass: the details of mountain and water hexes, over every top, so no
            // neighbor's top paints over them. (Each mountain itself is a sprite: buildMountains.)
            for (const { col, row, center } of hexes) {
                const terrain = terrainAt(col, row);
                if (terrain === TERRAIN.ground) continue;
                const index = hexIndex(col, row, mapWidth);
                const corners = this.hexCornerCache[index];
                if (terrain === TERRAIN.mountain) {
                    // Scree under the mountain: a few darker stones.
                    g.fillStyle(this.palette.screeSpeck, 0.8);
                    for (const [x, y, w, h] of pebbles(center, hexSeed(index, 2))) {
                        g.fillEllipse(x, y, w, h);
                    }
                    continue;
                }
                this.drawWaterDetails(g, col, row, corners, center, shallow(col, row), isWater);
            }

            tile.clear();
            tile.draw(g, -tile.x, -tile.y);
            tile.render();
            g.destroy();
        }
    }

    /**
     * A ground hex's texture, over its top: faint grains, an occasional hairline crack or patch of
     * frost (terrainArt.groundDetails), and a soft bevel (a light line inside its upper edges, a
     * shadow inside its lower ones) so each tile reads as a sleek panel.
     */
    private drawGroundDetails(
        g: Phaser.GameObjects.Graphics,
        col: number,
        row: number,
        corners: Phaser.Math.Vector2[],
        center: Point
    ): void {
        const index = hexIndex(col, row, this.room.state.mapWidth);
        const palette = this.palette;
        const { grains, cracks, frost } = groundDetails(
            center,
            index,
            groundDust(center, palette),
            palette
        );
        for (const patch of frost) {
            g.fillStyle(palette.ground.frost, 0.05);
            g.fillEllipse(patch.x, patch.y, patch.w, patch.h);
        }
        for (const crack of cracks) {
            g.lineStyle(1, palette.ground.crack, 0.3);
            g.strokePoints(crack as Phaser.Math.Vector2[], false);
        }
        for (const grain of grains) {
            g.fillStyle(grain.color, grain.alpha);
            g.fillCircle(grain.x, grain.y, grain.r);
        }
        // The bevel, just inside the edges: corners 3-4-5-0 run along the top, 0-1-2-3 the bottom.
        const inset = corners.map(
            (p) =>
                new Phaser.Math.Vector2(p.x + (center.x - p.x) * 0.07, p.y + (center.y - p.y) * 0.1)
        );
        g.lineStyle(1.2, 0xffffff, 0.07);
        g.strokePoints([inset[3], inset[4], inset[5], inset[0]], false);
        g.lineStyle(1.2, 0x000000, 0.12);
        g.strokePoints([inset[0], inset[1], inset[2], inset[3]], false);
    }

    /**
     * A water hex's details, over its top: the sandy bed of shallow water, ripples, and foam along
     * its front shores (its banks come earlier: drawBanks). Edges between two water hexes get
     * nothing, so a lake reads as one surface.
     */
    private drawWaterDetails(
        g: Phaser.GameObjects.Graphics,
        col: number,
        row: number,
        corners: Phaser.Math.Vector2[],
        center: Point,
        isShallow: boolean,
        isWater: (col: number, row: number) => boolean
    ): void {
        const index = hexIndex(col, row, this.room.state.mapWidth);
        const { liquid } = this.palette;
        // Where deep liquid mirrors the sky most (its top is already tinted there: drawBase), thin
        // horizontal glints, like sunset light on dark water. Not on shallows, nor in palettes
        // without reflections.
        const gleam = isShallow || liquid.deepGleam === 0 ? 0 : skyReflection(center);
        if (gleam > 0.25) {
            const random = seededRandom(hexSeed(index, 8));
            const glints = Math.round(gleam * 3);
            for (let k = 0; k < glints; k++) {
                g.fillStyle(liquid.glint, 0.3 * gleam);
                g.fillEllipse(
                    center.x + (random() * 2 - 1) * 14,
                    center.y + (random() * 2 - 1) * 7,
                    10 + random() * 14,
                    1.5
                );
            }
        }
        if (isShallow) {
            g.fillStyle(liquid.shallowBed, 0.3);
            for (const [x, y, w, h] of pebbles(center, hexSeed(index, 3)))
                g.fillEllipse(x, y, w, h);
        }
        g.lineStyle(1, liquid.ripple, isShallow ? 0.3 : 0.28);
        for (const wave of rippleMarks(center, hexSeed(index, 4), isShallow ? 1 : 2)) {
            g.strokePoints(wave as Phaser.Math.Vector2[], false);
        }

        // Foam just inside each front shore (the back shores get theirs with the bank: drawBanks).
        this.forEachEdge(col, row, corners, (a, b, neighbor) => {
            if (isWater(neighbor.col, neighbor.row) || corners.indexOf(a) >= 3) return;
            const ax = a.x + (center.x - a.x) * 0.06;
            const ay = a.y + (center.y - a.y) * 0.06;
            const bx = b.x + (center.x - b.x) * 0.06;
            const by = b.y + (center.y - b.y) * 0.06;
            g.lineStyle(1.5, liquid.foam, 0.45);
            g.lineBetween(ax, ay, bx, by);
        });
    }

    /**
     * The banks of a water hex: along each back shore (its three upper edges, where the neighbor
     * isn't water) the ground drops to the water, which sits lower, with foam where it meets it.
     * Drawn straight down right after the hex's top, in the back-to-front pass, so whatever pokes
     * past the hex's side corners is covered by the hexes in front, drawn next.
     */
    private drawBanks(
        g: Phaser.GameObjects.Graphics,
        col: number,
        row: number,
        corners: Phaser.Math.Vector2[],
        isShallow: boolean,
        isWater: (col: number, row: number) => boolean
    ): void {
        const bank = isShallow ? SHALLOW_BANK_HEIGHT : DEEP_BANK_HEIGHT;
        this.forEachEdge(col, row, corners, (a, b, neighbor) => {
            // Edges 3-5 run along the top of the hex (0-2 are the front ones).
            if (isWater(neighbor.col, neighbor.row) || corners.indexOf(a) < 3) return;
            const a2 = new Phaser.Math.Vector2(a.x, a.y + bank);
            const b2 = new Phaser.Math.Vector2(b.x, b.y + bank);
            g.fillStyle(this.palette.cliff, 1);
            g.fillPoints([a, b, b2, a2], true);
            g.lineStyle(1.5, this.palette.liquid.foam, 0.55);
            g.lineBetween(a2.x, a2.y, b2.x, b2.y);
        });
    }

    /**
     * Each mountain (`room.state.mountains`: 3 or 7 hexes) as one sprite: a faceted, snow-capped peak
     * over its hexes (terrainArt.mountainModel), baked into its own texture once. Its depth is the
     * middle of its footprint on the ground, like a player's, so someone walking behind a mountain is
     * hidden by it and someone in front isn't.
     */
    private buildMountains(): void {
        const { mapWidth, mountains } = this.room.state;
        const pad = 2;
        (mountains ?? []).forEach((piece, i) => {
            const hexes = Array.from(piece.hexes);
            if (hexes.length === 0) return;
            const corners = hexes.flatMap((index) => this.hexCornerCache[index] ?? []);
            const centers = hexes.map((index) => {
                const c = hexCenter(index % mapWidth, Math.floor(index / mapWidth));
                return project(c.x, c.y);
            });
            const model = mountainModel(
                corners,
                centers,
                piece.size >= 7,
                hexSeed(hexes[0], 5),
                ISO_SQUASH,
                this.palette
            );
            const { minX, minY, maxX, maxY } = model.bounds;
            const key = `mountain-${i}`;
            if (this.textures.exists(key)) this.textures.remove(key);
            const g = this.make.graphics({}, false);
            drawMountain(g, model, pad - minX, pad - minY, this.palette);
            g.generateTexture(
                key,
                Math.ceil(maxX - minX) + pad * 2,
                Math.ceil(maxY - minY) + pad * 2
            );
            g.destroy();
            this.add
                .image(minX - pad, minY - pad, key)
                .setOrigin(0, 0)
                .setDepth(model.anchor.y);
        });
    }

    /**
     * Glints on the water: a few small highlights on some water hexes, each fading in and out now and
     * then. Cheap (one tweened ellipse each, capped at MAX_SPARKLES) and off-screen ones aren't drawn.
     */
    private addWaterSparkles(): void {
        const { mapWidth, mapHeight, tiles } = this.room.state;
        const MAX_SPARKLES = 160;
        let made = 0;
        for (let index = 0; index < tiles.length && made < MAX_SPARKLES; index++) {
            if (tiles[index].terrain !== TERRAIN.water || hexSeed(index, 6) % 4 !== 0) continue;
            const col = index % mapWidth;
            const row = Math.floor(index / mapWidth);
            if (!isValidHex(col, row, mapWidth, mapHeight)) continue;
            const random = seededRandom(hexSeed(index, 7));
            const c = hexCenter(col, row);
            const at = project(c.x, c.y);
            const sparkle = this.add
                .ellipse(
                    at.x + (random() * 2 - 1) * 16,
                    at.y + (random() * 2 - 1) * 7,
                    5,
                    2,
                    this.palette.liquid.sparkle,
                    1
                )
                .setAlpha(0)
                .setDepth(-2.5);
            this.tweens.add({
                targets: sparkle,
                alpha: 0.75,
                duration: 500 + random() * 600,
                delay: random() * 5000,
                repeatDelay: 2000 + random() * 4000,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut',
            });
            made++;
        }
    }

    /**
     * Calls `visit` for each of a hex's six edges with its two (projected) corners and the hex on
     * the other side. Edge i runs from corner i to corner i + 1, which faces hexNeighbors index i + 1.
     */
    private forEachEdge(
        col: number,
        row: number,
        corners: Phaser.Math.Vector2[],
        visit: (
            a: Phaser.Math.Vector2,
            b: Phaser.Math.Vector2,
            neighbor: { col: number; row: number }
        ) => void
    ): void {
        const neighbors = hexNeighbors(col, row);
        for (let i = 0; i < 6; i++) visit(corners[i], corners[(i + 1) % 6], neighbors[(i + 1) % 6]);
    }

    /** Creates the claim chunk textures and records which hexes overlap which chunk. */
    private buildClaimChunks(layerWidth: number, layerHeight: number): void {
        const { mapWidth, mapHeight } = this.room.state;
        const chunkCols = Math.ceil(layerWidth / CLAIM_CHUNK_SIZE);
        const chunkRows = Math.ceil(layerHeight / CLAIM_CHUNK_SIZE);

        for (let row = 0; row < chunkRows; row++) {
            for (let col = 0; col < chunkCols; col++) {
                const chunk = this.add.renderTexture(
                    col * CLAIM_CHUNK_SIZE,
                    row * CLAIM_CHUNK_SIZE,
                    CLAIM_CHUNK_SIZE,
                    CLAIM_CHUNK_SIZE
                );
                chunk.setOrigin(0, 0).setDepth(-2);
                this.claimChunks.push(chunk);
                this.chunkHexes.push([]);
            }
        }

        // A hex belongs to every chunk its bounding box (plus a little margin for the border
        // stroke) touches, so hexes straddling a chunk edge are drawn in both halves.
        const margin = CLAIM_BORDER_WIDTH;
        for (let i = 0; i < mapWidth * mapHeight; i++) {
            const corners = this.hexCornerCache[i];
            const minX = Math.min(...corners.map((c) => c.x)) - margin;
            const maxX = Math.max(...corners.map((c) => c.x)) + margin;
            const minY = Math.min(...corners.map((c) => c.y)) - margin;
            const maxY = Math.max(...corners.map((c) => c.y)) + margin;

            const chunks: number[] = [];
            for (
                let cr = Math.floor(minY / CLAIM_CHUNK_SIZE);
                cr <= Math.floor(maxY / CLAIM_CHUNK_SIZE);
                cr++
            ) {
                for (
                    let cc = Math.floor(minX / CLAIM_CHUNK_SIZE);
                    cc <= Math.floor(maxX / CLAIM_CHUNK_SIZE);
                    cc++
                ) {
                    if (cc < 0 || cr < 0 || cc >= chunkCols || cr >= chunkRows) continue;
                    const chunkIndex = cr * chunkCols + cc;
                    chunks.push(chunkIndex);
                    this.chunkHexes[chunkIndex].push(i);
                }
            }
            this.hexChunks[i] = chunks;
        }

        this.renderedOwners = new Array<string>(mapWidth * mapHeight).fill('');
        this.claimScratch = this.make.graphics({}, false);
    }

    /**
     * Brings the claim textures up to date with room state: finds hexes whose owner changed since
     * they were last drawn and re-bakes only the chunks containing them. The cost of a claim is
     * therefore bounded by one chunk's worth of hexes, however many hexes are claimed overall.
     */
    private syncClaims(): void {
        const { tiles, players } = this.room.state;
        const dirtyChunks = new Set<number>();

        for (let i = 0; i < this.renderedOwners.length; i++) {
            const ownerId = tiles[i]?.ownerId ?? '';
            if (ownerId === this.renderedOwners[i]) continue;
            this.renderedOwners[i] = ownerId;
            for (const chunk of this.hexChunks[i]) dirtyChunks.add(chunk);
        }

        for (const chunk of dirtyChunks) this.rebakeChunk(chunk, players);
    }

    /** Redraws every claimed hex overlapping one chunk: owner-tinted top face plus a darker border. */
    private rebakeChunk(chunkIndex: number, players: ReadonlyMap<string, PlayerState>): void {
        const chunk = this.claimChunks[chunkIndex];
        const g = this.claimScratch;
        g.clear();
        g.setPosition(-chunk.x, -chunk.y); // draw in the chunk's local coordinates

        for (const i of this.chunkHexes[chunkIndex]) {
            const ownerId = this.renderedOwners[i];
            if (!ownerId) continue;
            const owner = players.get(ownerId);
            if (!owner) continue;

            const ownerColor = Phaser.Display.Color.HexStringToColor(
                owner.color || '#ffffff'
            ).color;
            // The tint washes out the base layer's outline, so draw a border again — otherwise
            // a group of same-colored hexes merges into one blob.
            // The owner's color at CLAIM_BLEND strength, see-through so the ground's texture shows.
            const fill = blendColors(this.palette.ground.base, ownerColor, CLAIM_BLEND);
            g.fillStyle(ownerColor, CLAIM_BLEND);
            g.fillPoints(this.hexCornerCache[i], true);
            g.lineStyle(CLAIM_BORDER_WIDTH, blendColors(fill, 0x000000, CLAIM_BORDER_DARKEN), 1);
            g.strokePoints(this.hexCornerCache[i], true);
        }

        chunk.clear();
        chunk.draw(g);
        chunk.render();
    }

    /**
     * Outlines the hex under the mouse — also a visual check that pointer picking matches the
     * drawn grid. In build mode it instead outlines the structure that would be built there:
     * yellow if it can be, red if not (the server makes the same check). Only redraws when what
     * it shows actually changes.
     */
    private drawHover(): void {
        const pointer = this.input.activePointer;
        const { mapWidth, mapHeight } = this.room.state;

        let hovered: { col: number; row: number; rotation: number } | null = null;
        if (this.tapPreview && performance.now() < this.tapPreview.until) {
            hovered = this.tapPreview;
        } else {
            this.tapPreview = null;
            if (!pointer.wasTouch) {
                const target = this.pointerToWorld(pointer);
                const hex = pixelToHex(target.x, target.y);
                if (isValidHex(hex.col, hex.row, mapWidth, mapHeight)) {
                    hovered = { ...hex, rotation: this.buildRotation(hex.col, hex.row, target) };
                }
            }
        }
        const valid =
            hovered !== null &&
            this.buildMode &&
            this.canPlaceStructure(hovered.col, hovered.row, hovered.rotation);
        const key = hovered
            ? `${hovered.col},${hovered.row},${hovered.rotation},${this.buildType},${this.buildMode},${valid}`
            : '';
        if (key === this.hoverKey) return;
        this.hoverKey = key;

        const g = this.hoverGraphics;
        g.clear();
        if (!hovered) return;
        if (this.buildMode) {
            const color = valid ? BUILD_PREVIEW_OK_COLOR : BUILD_PREVIEW_BAD_COLOR;
            const outlines =
                STRUCTURE_SPECS[this.buildType].hexes === 3
                    ? footprintFor(this.buildType, hovered.col, hovered.row, hovered.rotation).map(
                          (h) => hexCorners(h.col, h.row)
                      )
                    : [structureCorners(hovered.col, hovered.row)];
            for (const corners of outlines) {
                const outline = corners.map((p) => new Phaser.Math.Vector2(p.x, p.y));
                g.fillStyle(color, 0.18);
                g.fillPoints(outline, true);
                g.lineStyle(2, color, 0.95);
                g.strokePoints(outline, true);
            }
            return;
        }
        g.lineStyle(2, 0xffffff, 0.35);
        g.strokePoints(this.hexCornerCache[hexIndex(hovered.col, hovered.row, mapWidth)], true);
    }

    /**
     * Mirrors the server's StructureSystem.canPlace: every footprint hex (7, or 3 for a Guard
     * Tower) on the map, owned by you, and not in another structure's footprint.
     */
    private canPlaceStructure(col: number, row: number, rotation: number): boolean {
        const { mapWidth, mapHeight, tiles, structures } = this.room.state;
        return footprintFor(this.buildType, col, row, rotation).every((hex) => {
            if (!isValidHex(hex.col, hex.row, mapWidth, mapHeight)) return false;
            if (tiles[hexIndex(hex.col, hex.row, mapWidth)]?.ownerId !== this.sessionId)
                return false;
            for (const other of structures.values()) {
                if (inStructure(hex.col, hex.row, other)) return false;
            }
            return true;
        });
    }

    // --- Entities ----------------------------------------------------------

    private addPlayerView(player: PlayerState): void {
        if (this.playerViews.has(player.id)) return;

        const color = Phaser.Display.Color.HexStringToColor(player.color || '#ffffff').color;
        const isSelf = player.id === this.sessionId;

        const shadow = this.add.ellipse(
            0,
            0,
            PLAYER_RADIUS * 2,
            PLAYER_RADIUS * 2 * ISO_SQUASH,
            0x000000,
            0.35
        );
        const body = this.add.circle(0, -BODY_LIFT, PLAYER_RADIUS, color);
        body.setStrokeStyle(isSelf ? 3 : 1, 0xffffff, isSelf ? 1 : 0.6);
        const nose = this.add.circle(0, -BODY_LIFT, 4, 0xffffff);

        const start = project(player.x, player.y);
        const container = this.add.container(start.x, start.y, [shadow, body, nose]);
        container.setDepth(start.y);

        // Their spawn platform: on the ground, above the claim tint and under every entity.
        const spawn = hexCenter(player.spawnTileX, player.spawnTileY);
        const padAt = project(spawn.x, spawn.y);
        const pad = this.add.graphics();
        drawSpawnPad(pad, color);
        pad.setPosition(padAt.x, padAt.y).setDepth(-0.45);

        this.playerViews.set(player.id, {
            container,
            nose,
            color,
            ring: null,
            ringRadius: 0,
            pad,
            wx: player.x,
            wy: player.y,
        });
        if (isSelf) {
            this.cameras.main.startFollow(container, true, 0.15, 0.15);
            this.cameras.main.centerOn(start.x, start.y); // start on the player, no fly-in from the corner
        }
    }

    /**
     * Shows a semi-transparent circle, tinted with the player's color, at their claim radius once
     * they own the Expander (a claim radius above the base one). It's a circle on the ground, so on
     * screen it's an ellipse squashed by ISO_SQUASH like everything else on the map.
     */
    private updateClaimRing(view: PlayerView, player: PlayerState, at: Point): void {
        const hasExpander = player.claimRadius > BASE_CLAIM_RADIUS + 0.5;
        if (!hasExpander) {
            if (view.ring) {
                view.ring.destroy();
                view.ring = null;
            }
            return;
        }

        if (!view.ring || view.ringRadius !== player.claimRadius) {
            view.ring?.destroy();
            const diameter = player.claimRadius * 2;
            const ring = this.add.ellipse(0, 0, diameter, diameter * ISO_SQUASH, view.color);
            ring.setFillStyle(view.color, CLAIM_RING_FILL_ALPHA);
            ring.setStrokeStyle(2, view.color, CLAIM_RING_STROKE_ALPHA);
            ring.setDepth(-0.4); // above the terrain and hover outline, below every entity
            view.ring = ring;
            view.ringRadius = player.claimRadius;
        }
        view.ring.setPosition(at.x, at.y).setAlpha(view.container.alpha);
    }

    private removePlayerView(sessionId: string): void {
        const view = this.playerViews.get(sessionId);
        view?.container.destroy();
        view?.ring?.destroy();
        view?.pad.destroy();
        this.playerViews.delete(sessionId);
    }

    private addProjectileView(projectile: ProjectileState): void {
        if (this.projectileViews.has(projectile.id)) return;
        const start = project(projectile.x, projectile.y);

        // Placeholder art: a glowing bolt floating at body height over a small ground shadow. Big-gun
        // shots are a larger yellow bolt; basic-gun shots a smaller white one.
        const big = projectile.damage >= GUN_DAMAGE.big;
        const radius = PROJECTILE_RADIUS * (big ? BIG_SHOT_SCALE : BASIC_SHOT_SCALE);
        const colors = big ? BIG_SHOT_COLORS : BASIC_SHOT_COLORS;
        const shadow = this.add.ellipse(
            0,
            0,
            radius * 2.2,
            radius * 2.2 * ISO_SQUASH,
            0x000000,
            0.3
        );
        const glow = this.add.circle(0, -BODY_LIFT, radius * 1.8, colors.glow, 0.3);
        const core = this.add.circle(0, -BODY_LIFT, radius, colors.core);
        core.setStrokeStyle(big ? 2 : 1.5, colors.stroke, 1);

        const sprite = this.add.container(start.x, start.y, [shadow, glow, core]);
        sprite.setDepth(start.y);
        this.projectileViews.set(projectile.id, { sprite, wx: projectile.x, wy: projectile.y });
    }

    private removeProjectileView(id: string): void {
        this.projectileViews.get(id)?.sprite.destroy();
        this.projectileViews.delete(id);
    }

    /**
     * A structure is a raised slab in the shape of its footprint (the 7-hex hexagon, or the clump of
     * 3 hexes for a Guard Tower): side faces in the owner's team color (darkened), a top face in
     * the structure type's color (STRUCTURE_COLORS), and a team-colored border. Placeholder until
     * there's art per type. Drawn once — it never moves.
     */
    private addStructureSprite(structure: StructureState): void {
        if (this.structureSprites.has(structure.id)) return;
        const owner = this.room.state.players.get(structure.ownerId);
        const teamColor = owner
            ? Phaser.Display.Color.HexStringToColor(owner.color).color
            : 0xffffff;
        const topColor = STRUCTURE_COLORS[structure.type] ?? STRUCTURE_DEFAULT_COLOR;
        const compact =
            isStructureType(structure.type) && STRUCTURE_SPECS[structure.type].hexes === 3;

        const g = this.add.graphics();
        const lift = (p: Point): Phaser.Math.Vector2 =>
            new Phaser.Math.Vector2(p.x, p.y - STRUCTURE_HEIGHT);
        let lowest: number[];
        if (compact) {
            lowest = this.drawCompactSlab(g, structure, teamColor, topColor);
        } else {
            const ground = structureCorners(structure.tileX, structure.tileY);
            const top = ground.map(lift);

            // Side faces: only the edges facing the viewer (their outward normal points down the
            // screen) are visible. Corners go clockwise on screen, so the outward normal of edge
            // a -> b is (b.y - a.y, a.x - b.x).
            g.fillStyle(blendColors(teamColor, 0x000000, STRUCTURE_SIDE_DARKEN), 1);
            for (let i = 0; i < 6; i++) {
                const a = ground[i];
                const b = ground[(i + 1) % 6];
                if (a.x - b.x <= 0) continue;
                g.fillPoints(
                    [
                        new Phaser.Math.Vector2(a.x, a.y),
                        new Phaser.Math.Vector2(b.x, b.y),
                        top[(i + 1) % 6],
                        top[i],
                    ],
                    true
                );
            }
            g.fillStyle(topColor, 1);
            g.fillPoints(top, true);
            g.lineStyle(STRUCTURE_BORDER_WIDTH, teamColor, 1);
            g.strokePoints(top, true);
            lowest = ground.map((p) => p.y);
        }

        // Sort by the slab's northmost ground corner, not its center: anyone standing on it (its
        // owner or a teammate walking through) or in front of it draws on top; players behind it
        // are covered by it.
        g.setDepth(Math.min(...lowest));
        this.structureSprites.set(structure.id, g);
    }

    /**
     * Draws a Guard Tower's slab: three hexes raised together. Side faces go only on the outer
     * edges that face the viewer, then the three tops, then the team-colored border on the outer
     * edges only (so the hexes read as one piece). Returns the ground corners' y values, for depth.
     */
    private drawCompactSlab(
        g: Phaser.GameObjects.Graphics,
        structure: StructureState,
        teamColor: number,
        topColor: number
    ): number[] {
        const hexes = structureHexes(structure);
        const inside = new Set(hexes.map((h) => `${h.col},${h.row}`));
        // Hex corner i to i + 1 faces the neighbor at index (i + 1) % 6 of hexNeighbors.
        const outerEdges = (col: number, row: number) => {
            const corners = hexCorners(col, row);
            const around = hexNeighbors(col, row);
            const edges: Array<{ a: Point; b: Point; faces: boolean }> = [];
            for (let i = 0; i < 6; i++) {
                const n = around[(i + 1) % 6];
                if (inside.has(`${n.col},${n.row}`)) continue;
                // Edges 0-2 are the ones whose outward normal points down the screen.
                edges.push({ a: corners[i], b: corners[(i + 1) % 6], faces: i <= 2 });
            }
            return { corners, edges };
        };
        const v = (p: Point, up = 0) => new Phaser.Math.Vector2(p.x, p.y - up);

        g.fillStyle(blendColors(teamColor, 0x000000, STRUCTURE_SIDE_DARKEN), 1);
        for (const hex of hexes) {
            for (const { a, b, faces } of outerEdges(hex.col, hex.row).edges) {
                if (!faces) continue;
                g.fillPoints([v(a), v(b), v(b, STRUCTURE_HEIGHT), v(a, STRUCTURE_HEIGHT)], true);
            }
        }
        g.fillStyle(topColor, 1);
        for (const hex of hexes) {
            g.fillPoints(
                outerEdges(hex.col, hex.row).corners.map((p) => v(p, STRUCTURE_HEIGHT)),
                true
            );
        }
        g.lineStyle(STRUCTURE_BORDER_WIDTH, teamColor, 1);
        for (const hex of hexes) {
            for (const { a, b } of outerEdges(hex.col, hex.row).edges) {
                g.lineBetween(a.x, a.y - STRUCTURE_HEIGHT, b.x, b.y - STRUCTURE_HEIGHT);
            }
        }
        return hexes.flatMap((h) => hexCorners(h.col, h.row).map((p) => p.y));
    }

    private removeStructureSprite(id: string): void {
        this.structureSprites.get(id)?.destroy();
        this.structureSprites.delete(id);
    }

    /**
     * A pickup: a drop pod (see game/pickups.ts) floating over its hex with a shadow, bobbing gently
     * with a pulsing light so it reads as something to grab. Never moves, so it's sorted once.
     */
    private addPickupView(pickup: PickupState): void {
        if (this.pickupViews.has(pickup.id)) return;
        const center = hexCenter(pickup.tileX, pickup.tileY);
        const ground = project(center.x, center.y);
        const shadow = this.add.ellipse(0, 0, 32, 32 * ISO_SQUASH, 0x000000, 0.3);
        // Every pickup is the same drop pod: what's inside is decided when it's opened.
        const glow = this.add.graphics();
        drawDropPodGlow(glow);
        const pod = this.add.graphics();
        drawDropPod(pod);
        for (const part of [glow, pod]) part.setScale(PICKUP_SCALE).setY(-PICKUP_LIFT);
        this.tweens.add({
            targets: [glow, pod],
            y: -PICKUP_LIFT - PICKUP_BOB,
            duration: PICKUP_BOB_MS,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
        this.tweens.add({
            targets: glow,
            alpha: { from: 0.25, to: 1 },
            duration: POD_GLOW_MS,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
        const container = this.add.container(ground.x, ground.y, [shadow, glow, pod]);
        container.setDepth(ground.y);
        this.pickupViews.set(pickup.id, container);
    }

    private removePickupView(id: string): void {
        const view = this.pickupViews.get(id);
        if (view) {
            this.tweens.killTweensOf(view.list);
            view.destroy();
        }
        this.pickupViews.delete(id);
    }

    /** Your backpack: the gear you dropped where you were defeated, on its hex (you alone see it). */
    private addBackpackView(pack: BackpackState): void {
        if (this.backpackViews.has(pack.id)) return;
        const center = hexCenter(pack.tileX, pack.tileY);
        const ground = project(center.x, center.y);
        const ring = this.add.graphics();
        drawBackpackRing(ring, HEX_SIZE * 1.5, HEX_SIZE * 1.5 * ISO_SQUASH);
        const shadow = this.add.ellipse(0, 0, 28, 28 * ISO_SQUASH, 0x000000, 0.35);
        const bag = this.add.graphics();
        drawBackpack(bag);
        bag.setScale(BACKPACK_SCALE).setY(-BACKPACK_LIFT);
        this.tweens.add({
            targets: ring,
            alpha: { from: 0.3, to: 1 },
            scale: { from: 0.85, to: 1.05 },
            duration: BACKPACK_RING_MS,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut',
        });
        const container = this.add.container(ground.x, ground.y, [ring, shadow, bag]);
        container.setDepth(ground.y);
        this.backpackViews.set(pack.id, container);
    }

    private removeBackpackView(id: string): void {
        const view = this.backpackViews.get(id);
        if (view) {
            this.tweens.killTweensOf(view.list);
            view.destroy();
        }
        this.backpackViews.delete(id);
    }

    /**
     * Eases every entity's drawn position toward the server's latest state.
     * The server updates at 20Hz; chasing that with exponential smoothing
     * (frame-rate independent) plus a small velocity extrapolation keeps motion
     * fluid at any frame rate instead of stepping tick by tick.
     */
    private updateEntities(dt: number): void {
        const smoothing = 1 - Math.exp(-SMOOTHING_RATE * dt);

        this.room.state.players.forEach((player, id) => {
            const view = this.playerViews.get(id);
            if (!view) return;

            this.chase(
                view,
                player.x + player.vx * EXTRAPOLATION_S,
                player.y + player.vy * EXTRAPOLATION_S,
                smoothing
            );

            const at = project(view.wx, view.wy);
            view.container.setPosition(at.x, at.y).setDepth(at.y);
            // Defeated players are out of play until they respawn: not drawn (the camera stays
            // where you fell, and the respawn jump snaps rather than glides; see SNAP_DISTANCE).
            view.container.setVisible(player.respawnAt === 0);
            // Disconnected players are frozen in place on the server, so keep drawing them, dimmed.
            view.container.setAlpha(
                player.connected || id === this.sessionId ? 1 : DISCONNECTED_ALPHA
            );
            this.updateClaimRing(view, player, at);

            // Your own facing is drawn from local input so it never lags the mouse.
            const facing = id === this.sessionId ? this.aimAngle : player.angle;
            view.nose.setPosition(
                Math.cos(facing) * PLAYER_RADIUS * 0.85,
                Math.sin(facing) * PLAYER_RADIUS * 0.85 * ISO_SQUASH - BODY_LIFT
            );
        });

        this.room.state.projectiles.forEach((projectile, id) => {
            const view = this.projectileViews.get(id);
            if (!view) return;

            const velocity = projectileVelocity(projectile.angle, projectile.speed);
            this.chase(
                view,
                projectile.x + velocity.x * EXTRAPOLATION_S,
                projectile.y + velocity.y * EXTRAPOLATION_S,
                smoothing
            );

            const at = project(view.wx, view.wy);
            view.sprite.setPosition(at.x, at.y).setDepth(at.y);
        });
    }

    private chase(
        view: { wx: number; wy: number },
        targetX: number,
        targetY: number,
        smoothing: number
    ): void {
        if (Math.hypot(targetX - view.wx, targetY - view.wy) > SNAP_DISTANCE) {
            view.wx = targetX; // respawn/teleport — don't glide across the map
            view.wy = targetY;
            return;
        }
        view.wx += (targetX - view.wx) * smoothing;
        view.wy += (targetY - view.wy) * smoothing;
    }
}

function blendColors(from: number, to: number, amount: number): number {
    const channel = (shift: number) => {
        const a = (from >> shift) & 0xff;
        const b = (to >> shift) & 0xff;
        return Math.round(a + (b - a) * amount);
    };
    return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}
