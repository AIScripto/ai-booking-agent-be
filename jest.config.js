module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  verbose: true,
  forceExit: true,
  // Integration tests talk to a real database and can be slow on a busy machine.
  testTimeout: 15000,
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};
