// Server WebSocket endpoint. Override with a .env.local file:
//   VITE_SERVER_URL=ws://localhost:2567
export const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'ws://localhost:2567';

// The same server over HTTP, for GET /games (the game list).
export const SERVER_HTTP_URL = SERVER_URL.replace(/^ws(s?):/, 'http$1:');
