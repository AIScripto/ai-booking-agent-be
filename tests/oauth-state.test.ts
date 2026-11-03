import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/services/db.service';
import { OAuthStateService } from '../src/services/oauth-state.service';

describe('OAuth state (SEC-006)', () => {
  const tenantId = '3f1c8a52-0b7d-4c1e-9a55-6d2e7b1f0d01';
  const otherTenant = '3f1c8a52-0b7d-4c1e-9a55-6d2e7b1f0d02';

  describe('OAuthStateService', () => {
    it('returns the tenant for a genuine state, once only', () => {
      const state = OAuthStateService.create(tenantId);
      expect(OAuthStateService.consume(state)).toBe(tenantId);
      expect(OAuthStateService.consume(state)).toBeNull();
    });

    it('rejects a bare tenant id', () => {
      expect(OAuthStateService.consume(tenantId)).toBeNull();
    });

    it('rejects a state whose tenant was changed', () => {
      const parts = OAuthStateService.create(tenantId).split('.');
      parts[0] = otherTenant;
      expect(OAuthStateService.consume(parts.join('.'))).toBeNull();
    });

    it('rejects a state with a changed signature', () => {
      const state = OAuthStateService.create(tenantId);
      const tampered = state.slice(0, -1) + (state.endsWith('0') ? '1' : '0');
      expect(OAuthStateService.consume(tampered)).toBeNull();
    });

    it('rejects an expired state', () => {
      const old = Date.now() - 11 * 60 * 1000;
      const state = OAuthStateService.create(tenantId, old);
      expect(OAuthStateService.consume(state)).toBeNull();
    });

    it('rejects values that are not strings', () => {
      expect(OAuthStateService.consume(undefined)).toBeNull();
      expect(OAuthStateService.consume(['a', 'b'])).toBeNull();
    });
  });

  describe('GET /api/v1/auth/google/callback', () => {
    beforeAll(async () => {
      await prisma.tenant.upsert({
        where: { id: tenantId },
        update: {},
        create: { id: tenantId, name: 'OAuth State Test', industry: 'HEALTHCARE' },
      });
      await prisma.googleCredential.deleteMany({ where: { tenantId } });
    });

    afterAll(async () => {
      await prisma.googleCredential.deleteMany({ where: { tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    });

    it('returns 400 when state is a bare tenant id (the old forgeable form)', async () => {
      const res = await request(app).get('/api/v1/auth/google/callback').query({ code: 'mock-code', state: tenantId });
      expect(res.status).toBe(400);
      expect(await prisma.googleCredential.count({ where: { tenantId } })).toBe(0);
    });

    it('accepts a signed state once, then returns 400 when it is reused', async () => {
      const state = OAuthStateService.create(tenantId);
      const first = await request(app).get('/api/v1/auth/google/callback').query({ code: 'mock-code', state });
      expect(first.status).toBe(200);

      const second = await request(app).get('/api/v1/auth/google/callback').query({ code: 'mock-code', state });
      expect(second.status).toBe(400);
    });

    it('escapes the error value in the HTML response', async () => {
      const res = await request(app)
        .get('/api/v1/auth/google/callback')
        .query({ error: '<script>alert(1)</script>' });
      expect(res.status).toBe(400);
      expect(res.text).not.toContain('<script>alert(1)</script>');
      expect(res.text).toContain('&lt;script&gt;');
    });
  });
});
