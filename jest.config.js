module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  verbose: true,
  forceExit: true,
  // Integration tests talk to a real database and can be slow on a busy machine.
  testTimeout: 15000,
  // Many suites share one local Postgres. Fewer parallel workers keeps them from starving each other.
  maxWorkers: 4,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};
