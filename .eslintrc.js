module.exports = {
  parser: '@typescript-eslint/parser',
  extends: ['plugin:@typescript-eslint/recommended', 'prettier'],
  plugins: ['@typescript-eslint', 'prettier'],
  env: {
    es6: true,
    node: true
  },
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-inferrable-types': ['error', {ignoreParameters: true, ignoreProperties: true}],
    '@typescript-eslint/no-unused-vars': ['warn', {args: 'none'}]
  },
  ignorePatterns: ['lib/', 'node_modules/']
};
