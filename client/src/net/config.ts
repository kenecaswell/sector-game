// Server WebSocket endpoint. Override with a .env.local file:
//   VITE_SERVER_URL=ws://localhost:2567
export const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'ws://localhost:2567';
