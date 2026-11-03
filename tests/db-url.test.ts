import { withPoolSettings } from '../src/services/db-url';

const settings = { connectionLimit: 20, poolTimeoutSeconds: 30, connectTimeoutSeconds: 15 };

describe('Database pool settings (distant database)', () => {
  it('adds the pool settings to a URL that has none, and keeps the rest', () => {
    const out = new URL(withPoolSettings('postgresql://user:p%40ss@db.example.com:5432/booking_agent', settings));
    expect(out.searchParams.get('connection_limit')).toBe('20');
    expect(out.searchParams.get('pool_timeout')).toBe('30');
    expect(out.searchParams.get('connect_timeout')).toBe('15');
    expect(out.username).toBe('user');
    expect(out.password).toBe('p%40ss');
    expect(out.hostname).toBe('db.example.com');
    expect(out.port).toBe('5432');
    expect(out.pathname).toBe('/booking_agent');
  });

  it('keeps other parameters already in the URL', () => {
    const out = new URL(withPoolSettings('postgresql://u:p@h:5432/d?schema=public&sslmode=require', settings));
    expect(out.searchParams.get('schema')).toBe('public');
    expect(out.searchParams.get('sslmode')).toBe('require');
    expect(out.searchParams.get('connection_limit')).toBe('20');
  });

  it('never overrides a value that is already set in the URL', () => {
    const out = new URL(withPoolSettings('postgresql://u:p@h:5432/d?connection_limit=5&pool_timeout=7', settings));
    expect(out.searchParams.get('connection_limit')).toBe('5');
    expect(out.searchParams.get('pool_timeout')).toBe('7');
    expect(out.searchParams.get('connect_timeout')).toBe('15');
  });

  it('returns the original text when the URL cannot be read', () => {
    expect(withPoolSettings('not a url', settings)).toBe('not a url');
  });
});
