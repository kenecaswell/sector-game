import { createServer } from 'http';
import cors from 'cors';
import express from 'express';
import { Server } from 'colyseus';
import { Encoder } from '@colyseus/schema';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { GameRoom } from './rooms/GameRoom';
import { listGames } from './games';

// Default BUFFER_SIZE (8KB) is too small for a full-state sync of the map (4,096 Tile schema
// instances on a Small map, 9,216 on a Large one, plus players/structures/projectiles) — bump it
// so `getFullState` doesn't overflow when a client joins.
Encoder.BUFFER_SIZE = 256 * 1024;

const PORT = Number(process.env.PORT) || 2567;

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});

// The open games, for the client's game list (see games.ts).
app.get('/games', (_req, res) => {
    listGames()
        .then((games) => res.json(games))
        .catch(() => res.status(500).json({ error: 'could not list games' }));
});

const httpServer = createServer(app);

const gameServer = new Server({
    transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define('GameRoom', GameRoom);

httpServer.listen(PORT, () => {
    console.log(`Game server listening on :${PORT}`);
});
