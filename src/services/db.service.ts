import { PrismaClient } from '@prisma/client';
import { config } from '../config';
import { withPoolSettings } from './db-url';

export const prisma = new PrismaClient({
  datasourceUrl: withPoolSettings(config.DATABASE_URL, {
    connectionLimit: config.DB_CONNECTION_LIMIT,
    poolTimeoutSeconds: config.DB_POOL_TIMEOUT_SECONDS,
    connectTimeoutSeconds: config.DB_CONNECT_TIMEOUT_SECONDS,
  }),
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
});
