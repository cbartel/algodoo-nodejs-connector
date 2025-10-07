import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import unicorn from 'eslint-plugin-unicorn';
import importPlugin from 'eslint-plugin-import';
import promise from 'eslint-plugin-promise';
import n from 'eslint-plugin-n';
import prettierConfig from 'eslint-config-prettier';

const IGNORE = [
  '**/dist/**',
  '**/build/**',
  '**/.vite/**',
  '**/.tsup/**',
  '**/coverage/**',
  '**/.cache/**',
  'node_modules/**',
  '**/*.d.ts',
  'apps/marblerace/web/dist/**',
  'eslint.config.mjs',
];

export default tseslint.config(
  // Global ignores
  { ignores: IGNORE },

  // Base recommended JS
  js.configs.recommended,

  // Recommended TypeScript (non type-checked to reduce noise)
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,

  // Prettier turn-off rules (let Prettier handle formatting)
  { name: 'prettier-overrides', rules: { ...prettierConfig.rules } },

  // Shared plugin/rules for JS/TS
  {
    name: 'shared-modern',
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    plugins: { import: importPlugin, promise, unicorn, n },
    rules: {
      'no-console': 'off',
      'prefer-const': 'error',
      'import/no-unresolved': 'off',
      'no-empty': 'warn',
      'no-useless-catch': 'warn',
      'import/order': [
        'warn',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            ['parent', 'sibling', 'index'],
            'object',
            'type',
          ],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'promise/no-return-wrap': 'warn',
      'unicorn/prefer-node-protocol': 'error',
      'unicorn/prevent-abbreviations': 'off',
      // Relax some noisy core rules
      'no-useless-escape': 'warn',
    },
    settings: {
      'import/resolver': { typescript: { project: true } },
    },
  },

  // TS-specific extras
  {
    name: 'typescript-extras',
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      // Do not enable projectService here to avoid type-aware rules globally
      parserOptions: { sourceType: 'module', ecmaVersion: 'latest' },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-floating-promises': 'off',
      // Relax aggressive TS rules for this codebase
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-base-to-string': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },

  // React (web app)
  {
    name: 'react',
    files: ['apps/marblerace/web/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: new URL('.', import.meta.url).pathname,
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { react: reactPlugin, 'react-hooks': reactHooks },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/jsx-uses-react': 'off',
    },
    settings: { react: { version: 'detect' } },
  },
);
