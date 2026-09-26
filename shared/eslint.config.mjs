// shared/ has no node_modules of its own, so it's linted with the server's ESLint and rules
// (`npm run lint` in server/ covers it). This file only moves ESLint's base path here.
export { default } from '../server/eslint.config.mjs';
