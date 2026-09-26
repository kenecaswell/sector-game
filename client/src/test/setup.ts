// Runs before every spec file (see `test.setupFiles` in vite.config.ts).
import '@testing-library/jest-dom/vitest'; // DOM matchers: toBeInTheDocument, toBeDisabled, ...
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Unmount whatever a test rendered and forget stored values, so tests can't affect each other.
afterEach(() => {
    cleanup();
    localStorage.clear();
});
