// Runs before each test file.
//
// 1. The short user-check memory is off in tests, so the tests that expect a deactivation or role
//    change to apply at once stay exact. auth-cache.test.ts turns it on.
//
// 2. No connection reuse for the test HTTP client. supertest starts a new throwaway server on a random
//    port for every request. Since Node 19 the default agent keeps connections open, so a later request
//    that gets the same port number can travel over an old connection and be answered by the wrong
//    server instance, which shows up as random 400/404 responses under load.
process.env.AUTH_CACHE_SECONDS = '0';

const http = require('http');
const https = require('https');
http.globalAgent = new http.Agent({ keepAlive: false });
https.globalAgent = new https.Agent({ keepAlive: false });
