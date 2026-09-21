import { createServer } from 'http';
import cors from 'cors';
import express from 'express';
import { Server } from 'colyseus';
import { Encoder } from '@colyseus/schema';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { GameRoom } from './rooms/GameRoom';

// Default BUFFER_SIZE (8KB) is too small for a full-state sync of a 64x64
// tile map (4096 Tile schema instances plus players/structures/projectiles) —
// bump it so `getFullState` doesn't overflow when a client joins.
Encoder.BUFFER_SIZE = 128 * 1024;

const PORT = Number(process.env.PORT) || 2567;

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});

const httpServer = createServer(app);

const gameServer = new Server({
    transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define('GameRoom', GameRoom);

httpServer.listen(PORT, () => {
    console.log(`Game server listening on :${PORT}`);
});
