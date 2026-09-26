import Phaser from 'phaser';
import { getStateCallbacks, type GameRoom } from '../../net/GameConnection';
import type { PlayerState, ProjectileState, StructureState } from '../../types/gameState';
import { GUN_DAMAGE } from '../../types/shared';
import {
    BACKGROUND_COLOR,
    BASE_CLAIM_RADIUS,
    BODY_LIFT,
    CLAIM_BLEND,
    CLAIM_BORDER_DARKEN,
    CLAIM_BORDER_WIDTH,
    CLAIM_CHUNK_SIZE,
    CLAIM_RING_FILL_ALPHA,
    DISCONNECTED_ALPHA,
    CLAIM_RING_STROKE_ALPHA,
    EXTRAPOLATION_S,
    FIRE_INTERVAL_MS,
    HEX_DEPTH,
    HEX_OUTLINE_COLOR,
    HEX_SIDE_COLOR,
    HEX_SIDE_DARK_COLOR,
    HEX_SIZE,
    HEX_TOP_COLOR,
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
} from '../constants';
import {
    hexCenter,
    hexCorners,
    hexIndex,
    inStructureFootprint,
    isValidHex,
    mapPixelSize,
    structureCorners,
    structureFootprint,
    pixelToHex,
    project,
    unproject,
    type Point,
} from '../hex';

export interface GameSceneCallbacks {
    onInput: (dir: { x: number; y: number }, angle: number) => void;
    onShoot: (angle: number) => void;
    onPlaceStructure: (tileX: number, tileY: number) => void;
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
    wx: number;
    wy: number;
}

interface ProjectileView {
    sprite: Phaser.GameObjects.Container;
    wx: number;
    wy: number;
}

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
    private sessionId = '';
    private callbacks!: GameSceneCallbacks;

    // Terrain is baked into textures. A Graphics object re-runs its whole command list every
    // frame, so drawing 4,096 hexes that way cost ~50ms per frame (~19fps); a baked texture is
    // one quad per frame.
    private baseLayer!: Phaser.GameObjects.RenderTexture; // static hex terrain, baked once
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
    // Touch has no hover, so a refused build tap shows its red outline here for a moment.
    private tapPreview: { col: number; row: number; until: number } | null = null;

    private cursorKeys!: Phaser.Types.Input.Keyboard.CursorKeys;
    private wasdKeys!: {
        W: Phaser.Input.Keyboard.Key;
        A: Phaser.Input.Keyboard.Key;
        S: Phaser.Input.Keyboard.Key;
        D: Phaser.Input.Keyboard.Key;
    };
    private buildMode = false;

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
        this.tapPreview = null;
        this.joystick = { x: 0, y: 0 };
    }

    create(): void {
        const { mapWidth, mapHeight } = this.room.state;
        const world = mapPixelSize(mapWidth, mapHeight);

        // Deliberately no camera bounds: the camera always centers on your player, even at the
        // map's edge (showing empty space beyond it), so you can never walk off the screen.
        this.cameras.main.setBackgroundColor(BACKGROUND_COLOR);

        const layerWidth = Math.ceil(world.width) + 1;
        const layerHeight = Math.ceil(world.height * ISO_SQUASH + HEX_DEPTH) + 1;
        this.baseLayer = this.add.renderTexture(0, 0, layerWidth, layerHeight);
        this.baseLayer.setOrigin(0, 0).setDepth(-3);
        this.hoverGraphics = this.add.graphics().setDepth(-1);
        // A ring on the ground where a right-click told the player to go.
        this.targetMarker = this.add.ellipse(0, 0, HEX_SIZE * 1.2, HEX_SIZE * 1.2 * ISO_SQUASH);
        this.targetMarker
            .setStrokeStyle(2, TARGET_MARKER_COLOR, 0.9)
            .setDepth(-0.5)
            .setVisible(false);
        this.buildHexCornerCache();
        this.drawBase();
        this.buildClaimChunks(layerWidth, layerHeight);

        const $ = getStateCallbacks(this.room);

        $(this.room.state).players.onAdd((player) => this.addPlayerView(player));
        $(this.room.state).players.onRemove((_player, sessionId) => {
            this.removePlayerView(sessionId);
            this.claimsDirty = true; // a departing player's tiles are released without a tilesClaimed event
        });

        $(this.room.state).projectiles.onAdd((projectile) => this.addProjectileView(projectile));
        $(this.room.state).projectiles.onRemove((_projectile, id) => this.removeProjectileView(id));

        $(this.room.state).structures.onAdd((structure) => this.addStructureSprite(structure));
        $(this.room.state).structures.onRemove((_structure, id) => this.removeStructureSprite(id));

        // Existing entities at scene-create time (server sends full state on join,
        // and onAdd only fires for changes *after* the callback is registered).
        this.room.state.players.forEach((player) => this.addPlayerView(player));
        this.room.state.projectiles.forEach((projectile) => this.addProjectileView(projectile));
        this.room.state.structures.forEach((structure) => this.addStructureSprite(structure));

        const stopListeningForClaims = this.room.onMessage('tilesClaimed', () => {
            this.claimsDirty = true;
        });
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => stopListeningForClaims());

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

    /** Toggled by the React "Build" button so the next tap places a structure instead of shooting. */
    setBuildMode(active: boolean): void {
        this.buildMode = active;
    }

    /** Called by the mobile fire button: while held, shoots along the current aim at FIRE_INTERVAL_MS. */
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
            if (this.canPlaceStructure(col, row)) {
                this.callbacks.onPlaceStructure(col, row);
                this.buildMode = false;
            } else if (pointer.wasTouch) {
                // Stay in build mode and show why: the outline turns red for a moment.
                this.tapPreview = { col, row, until: performance.now() + BUILD_PREVIEW_TAP_MS };
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
        if (now - this.lastShotAt < FIRE_INTERVAL_MS) return;
        if (this.room.state.phase.phase !== 'playing') return;
        const me = this.room.state.players.get(this.sessionId);
        if (!me || me.gun === '' || me.ammo <= 0) return;

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
     * Draws every hex once: cliff faces first, then the top, tiles sorted from
     * back (top of screen) to front so a nearer tile's top covers the face of
     * the tile behind it. Claim tints are separate chunked layers (syncClaims), so this
     * never has to be redrawn.
     */
    private drawBase(): void {
        const { mapWidth, mapHeight } = this.room.state;
        const g = this.make.graphics({}, false);

        const order: Array<{ col: number; row: number; y: number }> = [];
        for (let row = 0; row < mapHeight; row++) {
            for (let col = 0; col < mapWidth; col++) {
                order.push({ col, row, y: hexCenter(col, row).y });
            }
        }
        order.sort((a, b) => a.y - b.y || a.col - b.col);

        for (const { col, row } of order) {
            const corners = this.hexCornerCache[hexIndex(col, row, mapWidth)];

            // Only the three lower edges (right, bottom, left) show a cliff face.
            for (let i = 0; i < 3; i++) {
                const a = corners[i];
                const b = corners[i + 1];
                g.fillStyle(i === 1 ? HEX_SIDE_DARK_COLOR : HEX_SIDE_COLOR, 1);
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

            g.fillStyle(HEX_TOP_COLOR, 1);
            g.fillPoints(corners, true);
            g.lineStyle(1, HEX_OUTLINE_COLOR, 0.6);
            g.strokePoints(corners, true);
        }

        this.bake(this.baseLayer, g);
    }

    /** Replaces a layer's contents with what `source` draws, then frees `source`. */
    private bake(
        layer: Phaser.GameObjects.RenderTexture,
        source: Phaser.GameObjects.Graphics
    ): void {
        layer.clear();
        layer.draw(source);
        layer.render();
        source.destroy();
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
            // The fill covers the base layer's outline, so draw a border again — otherwise
            // a group of same-colored hexes merges into one blob.
            const fill = blendColors(HEX_TOP_COLOR, ownerColor, CLAIM_BLEND);
            g.fillStyle(fill, 1);
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

        let hovered: { col: number; row: number } | null = null;
        if (this.tapPreview && performance.now() < this.tapPreview.until) {
            hovered = this.tapPreview;
        } else {
            this.tapPreview = null;
            if (!pointer.wasTouch) {
                const target = this.pointerToWorld(pointer);
                const hex = pixelToHex(target.x, target.y);
                if (isValidHex(hex.col, hex.row, mapWidth, mapHeight)) hovered = hex;
            }
        }
        const valid =
            hovered !== null && this.buildMode && this.canPlaceStructure(hovered.col, hovered.row);
        const key = hovered ? `${hovered.col},${hovered.row},${this.buildMode},${valid}` : '';
        if (key === this.hoverKey) return;
        this.hoverKey = key;

        const g = this.hoverGraphics;
        g.clear();
        if (!hovered) return;
        if (this.buildMode) {
            const color = valid ? BUILD_PREVIEW_OK_COLOR : BUILD_PREVIEW_BAD_COLOR;
            const outline = structureCorners(hovered.col, hovered.row).map(
                (p) => new Phaser.Math.Vector2(p.x, p.y)
            );
            g.fillStyle(color, 0.18);
            g.fillPoints(outline, true);
            g.lineStyle(2, color, 0.95);
            g.strokePoints(outline, true);
            return;
        }
        g.lineStyle(2, 0xffffff, 0.35);
        g.strokePoints(this.hexCornerCache[hexIndex(hovered.col, hovered.row, mapWidth)], true);
    }

    /**
     * Mirrors the server's StructureSystem.canPlace: all 7 footprint hexes on the map, owned by
     * you, and not in another structure's footprint.
     */
    private canPlaceStructure(col: number, row: number): boolean {
        const { mapWidth, mapHeight, tiles, structures } = this.room.state;
        return structureFootprint(col, row).every((hex) => {
            if (!isValidHex(hex.col, hex.row, mapWidth, mapHeight)) return false;
            if (tiles[hexIndex(hex.col, hex.row, mapWidth)]?.ownerId !== this.sessionId)
                return false;
            for (const other of structures.values()) {
                if (inStructureFootprint(hex.col, hex.row, other.tileX, other.tileY)) return false;
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

        this.playerViews.set(player.id, {
            container,
            nose,
            color,
            ring: null,
            ringRadius: 0,
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
     * A structure is a raised slab in the shape of its 7-hex hexagon: side faces in the owner's
     * team color (darkened), a top face in the structure type's color (STRUCTURE_COLORS), and a
     * team-colored border. Placeholder until there's art per type. Drawn once — it never moves.
     */
    private addStructureSprite(structure: StructureState): void {
        if (this.structureSprites.has(structure.id)) return;
        const owner = this.room.state.players.get(structure.ownerId);
        const teamColor = owner
            ? Phaser.Display.Color.HexStringToColor(owner.color).color
            : 0xffffff;
        const topColor = STRUCTURE_COLORS[structure.type] ?? STRUCTURE_DEFAULT_COLOR;

        const ground = structureCorners(structure.tileX, structure.tileY);
        const top = ground.map((p) => ({ x: p.x, y: p.y - STRUCTURE_HEIGHT }));
        const g = this.add.graphics();

        // Side faces: only the edges facing the viewer (their outward normal points down the
        // screen) are visible. Corners go clockwise on screen, so the outward normal of edge
        // a -> b is (b.y - a.y, a.x - b.x).
        g.fillStyle(blendColors(teamColor, 0x000000, STRUCTURE_SIDE_DARKEN), 1);
        for (let i = 0; i < 6; i++) {
            const a = ground[i];
            const b = ground[(i + 1) % 6];
            if (a.x - b.x <= 0) continue;
            g.fillPoints(
                [a, b, top[(i + 1) % 6], top[i]].map((p) => new Phaser.Math.Vector2(p.x, p.y)),
                true
            );
        }
        const topPoints = top.map((p) => new Phaser.Math.Vector2(p.x, p.y));
        g.fillStyle(topColor, 1);
        g.fillPoints(topPoints, true);
        g.lineStyle(STRUCTURE_BORDER_WIDTH, teamColor, 1);
        g.strokePoints(topPoints, true);

        // Sort by the slab's northmost ground corner, not its center: anyone standing on it (its
        // owner or a teammate walking through) or in front of it draws on top; players behind it
        // are covered by it.
        g.setDepth(Math.min(...ground.map((p) => p.y)));
        this.structureSprites.set(structure.id, g);
    }

    private removeStructureSprite(id: string): void {
        this.structureSprites.get(id)?.destroy();
        this.structureSprites.delete(id);
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

            const velocity = this.projectileWorldVelocity(projectile.angle, projectile.speed);
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

    /**
     * World-space velocity of a projectile, mirroring CombatSystem: `speed` is
     * on-screen, so a shot heading up/down the screen moves faster in world
     * units than one heading sideways. Used to extrapolate between server ticks.
     */
    private projectileWorldVelocity(angle: number, speed: number): { x: number; y: number } {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const yScale = UNIFORM_SCREEN_SPEED ? ISO_SQUASH : 1;
        const onScreenLength = Math.hypot(cos, sin * yScale);
        return { x: (cos / onScreenLength) * speed, y: (sin / onScreenLength) * speed };
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
