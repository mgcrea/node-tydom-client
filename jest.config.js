module.exports = {
  roots: ['<rootDir>/src/', '<rootDir>/test/'],
  setupFiles: ['<rootDir>/test/setup.ts'],
  // setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  testEnvironment: 'node',
  collectCoverageFrom: ['src/**/*.ts']
};
