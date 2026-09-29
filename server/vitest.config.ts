import { defineConfig } from 'vitest/config';

// Server unit tests. Vitest transpiles with the settings in tsconfig.json, including the
// decorator options the Colyseus schema needs (see src/state/GameState.spec.ts).
export default defineConfig({
    test: {
        // Spec files sit next to the code they test: foo.ts -> foo.spec.ts.
        include: ['src/**/*.spec.ts'],
        environment: 'node',
        restoreMocks: true,
        // Some specs sweep hundreds of maps or approaches and take 4-5 s on their own, close to
        // Vitest's 5 s default, so they timed out when the machine was busy. Allow more.
        testTimeout: 20_000,
    },
});
