import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
    plugins: [react()],
    // Code shared with the server lives in ../shared (outside this folder); let the dev server read it.
    server: { fs: { allow: ['..'] } },
});
