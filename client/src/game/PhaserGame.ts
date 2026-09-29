import Phaser from 'phaser';
import { GAME_DISPOSED_KEY, GameScene, type GameSceneCallbacks } from './scenes/GameScene';
import type { GameRoom } from '../net/GameConnection';

export function createPhaserGame(
    parent: HTMLElement,
    room: GameRoom,
    sessionId: string,
    callbacks: GameSceneCallbacks
): Phaser.Game {
    const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent,
        width: parent.clientWidth || window.innerWidth,
        height: parent.clientHeight || window.innerHeight,
        backgroundColor: '#1a1a2e',
        scale: {
            mode: Phaser.Scale.RESIZE,
        },
        render: {
            // Laptops with two GPUs make browsers default to the weaker integrated one; ask for
            // the fast one. (Ignored where there's only one GPU.)
            powerPreference: 'high-performance',
        },
        // No `scene` entry here — GameScene needs init data (the room/sessionId/
        // callbacks), so it's added and started explicitly below rather than
        // auto-started by the config, which would run init() with no data first.
    });

    game.scene.add('GameScene', GameScene);
    game.scene.start('GameScene', { room, sessionId, callbacks });

    return game;
}

/**
 * Destroys a game made by createPhaserGame. Its scene stops listening to the room right away (see
 * GameScene.create): Phaser itself only tears a game down on its next frame, and never does for one
 * destroyed while it was still booting, as React StrictMode's throwaway first mount is in dev.
 */
export function destroyPhaserGame(game: Phaser.Game): void {
    game.registry.set(GAME_DISPOSED_KEY, true);
    game.destroy(true);
}
