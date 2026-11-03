// Runs before each test file. The short user-check memory is off in tests, so the tests that
// expect a deactivation or role change to apply at once stay exact. auth-cache.test.ts turns it on.
process.env.AUTH_CACHE_SECONDS = '0';
