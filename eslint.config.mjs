import obsidianmd from 'eslint-plugin-obsidianmd'
import neostandard from 'neostandard'

export default [
  { ignores: ['main.js', 'node_modules/**', 'esbuild.config.mjs', 'version-bump.mjs'] },
  ...obsidianmd.configs.recommended,
  ...neostandard({ ts: true, noJsx: true, semi: false }),
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parserOptions: { project: './tsconfig.json', sourceType: 'module' }
    },
    rules: {
      'no-new': 'off',
      'no-prototype-builtins': 'off',
      'no-void': ['error', { allowAsStatement: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { args: 'none', caughtErrorsIgnorePattern: '^_' }],
      // Obsidian APIs leak `any` everywhere; these would be all-noise:
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
      '@typescript-eslint/restrict-plus-operands': 'off'
    }
  }
]
