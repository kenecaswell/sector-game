import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  // Ignore build output
  { ignores: ['dist', 'node_modules'] },

  // Base + TypeScript recommended rules, applied to all TS/TSX source
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // Rules of Hooks + exhaustive-deps
      ...reactHooks.configs['recommended-latest'].rules,
      // Vite Fast Refresh: components must be the only export for HMR to work
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },

  // Disable ESLint rules that conflict with Prettier — keep this LAST
  prettier
);
