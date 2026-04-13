import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', '.wrangler/**', 'src/**/*.js'],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...tseslint.configs.stylistic,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      // tsconfig の noUnusedLocals/Parameters と被るため tsc に任せる
      '@typescript-eslint/no-unused-vars': 'off',
      // ゲームロジックでマジックナンバー多用するため off
      '@typescript-eslint/no-magic-numbers': 'off',
      // DOM要素取得などで頻出。段階的に潰すため warn に降格
      '@typescript-eslint/no-non-null-assertion': 'warn',
      // プレースホルダ用の空関数を許容。新規追加時のみ警告
      '@typescript-eslint/no-empty-function': 'warn',
    },
  },
);
