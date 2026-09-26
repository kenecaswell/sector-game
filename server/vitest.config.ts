import { defineConfig } from 'vitest/config';

// Server unit tests. Vitest transpiles with the settings in tsconfig.json, including the
// decorator options the Colyseus schema needs (see src/state/GameState.spec.ts).
export default defineConfig({
    test: {
        // Spec files sit next to the code they test: foo.ts -> foo.spec.ts.
        include: ['src/**/*.spec.ts'],
        environment: 'node',
        restoreMocks: true,
    },
});
