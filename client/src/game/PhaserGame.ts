import Phaser from 'phaser';
import { GameScene, type GameSceneCallbacks } from './scenes/GameScene';
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
