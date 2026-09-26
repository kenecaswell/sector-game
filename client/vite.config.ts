import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// https://vite.dev/config/ (and https://vitest.dev/config/ for `test`)
export default defineConfig({
    plugins: [react()],
    // Code shared with the server lives in ../shared (outside this folder); let the dev server read it.
    server: { fs: { allow: ['..'] } },
    test: {
        // Spec files sit next to the code they test: foo.ts -> foo.spec.ts.
        include: ['src/**/*.spec.{ts,tsx}'],
        environment: 'jsdom', // a simulated browser: DOM, localStorage, timers
        setupFiles: ['./src/test/setup.ts'],
        restoreMocks: true,
    },
});
