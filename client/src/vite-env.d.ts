/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** WebSocket endpoint of the game server, e.g. ws://localhost:2567 */
    readonly VITE_SERVER_URL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
