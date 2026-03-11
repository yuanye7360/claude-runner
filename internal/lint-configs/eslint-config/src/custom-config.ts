import type { Linter } from 'eslint';

const restrictedImportIgnores = [
  '**/vite.config.mts',
  '**/tailwind.config.mjs',
  '**/postcss.config.mjs',
];

const customConfig: Linter.Config[] = [
  {
    files: ['**/**.vue'],
    ignores: restrictedImportIgnores,
    rules: {
      'perfectionist/sort-objects': 'off',
    },
  },
  {
    // apps内部的一些基础规则
    files: ['apps/**/**'],
    ignores: restrictedImportIgnores,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['#/api/*'],
              message:
                'The #/api package cannot be imported, please use the @core package itself',
            },
            {
              group: ['#/layouts/*'],
              message:
                'The #/layouts package cannot be imported, please use the @core package itself',
            },
            {
              group: ['#/locales/*'],
              message:
                'The #/locales package cannot be imported, please use the @core package itself',
            },
            {
              group: ['#/stores/*'],
              message:
                'The #/stores package cannot be imported, please use the @core package itself',
            },
          ],
        },
      ],
      'perfectionist/sort-interfaces': 'off',
    },
  },
  {
    files: ['internal/**/**', 'scripts/**/**'],
    rules: {
      'no-console': 'off',
    },
  },
];

export { customConfig };
