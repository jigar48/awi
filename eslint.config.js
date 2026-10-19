import tseslint from 'typescript-eslint';
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      '.awi-audit/**',
      '.package-smoke/**',
      '.awi-smoke-*/**',
    ],
  },
  ...tseslint.configs.recommended,
);
