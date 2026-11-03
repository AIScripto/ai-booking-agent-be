/**
 * Adds connection-pool settings to a PostgreSQL URL when it does not already set them.
 *
 * Prisma reads these from the URL: `connection_limit` (pool size), `pool_timeout` (seconds a request
 * waits for a free connection) and `connect_timeout` (seconds allowed to open a new connection).
 * Anything already in the URL wins, so an operator can still override them there.
 * If the URL cannot be read, it is returned unchanged.
 */
export interface PoolSettings {
  connectionLimit: number;
  poolTimeoutSeconds: number;
  connectTimeoutSeconds: number;
}

export function withPoolSettings(databaseUrl: string, settings: PoolSettings): string {
  try {
    const url = new URL(databaseUrl);
    const defaults: Record<string, string> = {
      connection_limit: String(settings.connectionLimit),
      pool_timeout: String(settings.poolTimeoutSeconds),
      connect_timeout: String(settings.connectTimeoutSeconds),
    };
    for (const [key, value] of Object.entries(defaults)) {
      if (!url.searchParams.has(key)) url.searchParams.set(key, value);
    }
    return url.toString();
  } catch {
    return databaseUrl;
  }
}
