import tseslint from 'typescript-eslint';
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '.package-smoke/**',
      '.awi-smoke-*/**',
    ],
  },
  ...tseslint.configs.recommended,
);
