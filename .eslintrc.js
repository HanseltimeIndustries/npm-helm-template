// .eslintrc.js example
module.exports = {
  env: {
    node: true,
    es2021: true,
  },
  extends: 'eslint:recommended',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['prettier', 'import'],
  rules: {
    'prettier/prettier': 'error',
    // We just this since typescript won't compile esm to have .js extensions
    'import/extensions': ['error', 'ignorePackages'],
  },
  ignorePatterns: ['.yarn/**/*', 'dist/**/*', 'node_modules/**/*'],
  overrides: [
    {
      files: ['src/**/*.ts'],
      env: { browser: true, es6: true, node: true },
      extends: [
        'plugin:@typescript-eslint/eslint-recommended',
        'plugin:@typescript-eslint/recommended',
      ],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2018,
        sourceType: 'module',
        project: 'packages/*/tsconfig.json',
      },
      plugins: ['@typescript-eslint'],
    },
  ],
}
