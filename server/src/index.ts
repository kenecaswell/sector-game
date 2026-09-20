import cors from 'cors';
import { Server } from 'colyseus';
import { GameRoom } from './rooms/GameRoom';

const PORT = Number(process.env.PORT) || 2567;

const gameServer = new Server({
  express: (app) => {
    app.use(cors());
    app.get('/health', (_req, res) => {
      res.json({ status: 'ok' });
    });
  },
});

gameServer.define('GameRoom', GameRoom);

gameServer.listen(PORT).then(() => {
  console.log(`Game server listening on :${PORT}`);
});
