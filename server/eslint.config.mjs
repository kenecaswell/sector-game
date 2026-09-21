import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
    // Ignore build output
    { ignores: ['dist', 'node_modules'] },

    // Base + TypeScript recommended rules, applied to all TS source
    {
        files: ['**/*.ts'],
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: globals.node,
        },
    },

    // Disable ESLint rules that conflict with Prettier — keep this LAST
    prettier
);
