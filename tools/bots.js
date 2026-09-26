#!/usr/bin/env node
// Load bots: join a running server and wander around claiming hexes, so a real browser client has
// other players to render. Used for the performance pass in docs/ARCHITECTURE.md (profile the
// browser while bots claim hundreds of hexes).
//
//   node tools/bots.js [count=4] [seconds=120] [url=ws://localhost:2567]
//
// The bots join whatever room is open, so start a match in the browser first (join, Start Game,
// close the shop) and then run this. For a private setup that doesn't touch your dev server, run
// a second server (`PORT=2599 node server/dist/server/src/index.js`), a second client pointed at it
// (`VITE_SERVER_URL=ws://localhost:2599 npx vite --port 5199`), and pass ws://localhost:2599.

const { colyseusClient, sleep } = require('./lib');
const { Client } = colyseusClient();

const count = Number(process.argv[2] || 4);
const seconds = Number(process.argv[3] || 120);
const url = process.argv[4] || 'ws://localhost:2567';

(async () => {
    const bots = [];
    for (let i = 0; i < count; i++) {
        const room = await new Client(url).joinOrCreate('GameRoom');
        room.onMessage('*', () => {});
        bots.push(room);
    }
    console.log(
        `${bots.length} bots joined room ${bots[0].roomId} on ${url}; running for ${seconds}s`
    );

    let seq = 0;
    const heading = bots.map(() => Math.random() * Math.PI * 2);
    const end = Date.now() + seconds * 1000;
    while (Date.now() < end) {
        bots.forEach((room, i) => {
            // Now and then, turn a bit.
            if (Math.random() < 0.05) heading[i] += (Math.random() - 0.5) * 2.5;
            room.send('input', {
                dir: { x: Math.cos(heading[i]), y: Math.sin(heading[i]) },
                angle: heading[i],
                seq: ++seq,
            });
        });
        await sleep(100);
    }
    process.exit(0);
})().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
