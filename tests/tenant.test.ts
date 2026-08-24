import { describe, expect, it } from '@jest/globals';
import request from 'supertest';
const app = require('../src/app').default || require('../src/app');

describe('Tenant & Industry Preset Endpoints Integration Tests', () => {
  const seedTenantId = '9eb441c7-f788-4137-8043-d4d7c3080879';

  describe('GET /api/v1/tenant/vocabulary', () => {
    it('should return Healthcare vocabulary mapping for seeded tenant', async () => {
      const response = await request(app)
        .get(`/api/v1/tenant/vocabulary?tenant_id=${seedTenantId}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.industry).toBe('HEALTHCARE');
      expect(response.body.data.vocabulary.resourceLabel).toBe('Doctor / Specialist');
      expect(response.body.data.vocabulary.customerLabel).toBe('Patient');
    });

    it('should return 400 if tenant_id query param is missing', async () => {
      const response = await request(app).get('/api/v1/tenant/vocabulary');
      expect(response.status).toBe(400);
    });
  });

  describe('GET & PUT /api/v1/tenant/branding', () => {
    it('should fetch tenant branding profile with resources and service types', async () => {
      const response = await request(app)
        .get(`/api/v1/tenant/branding?tenant_id=${seedTenantId}`);

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      expect(response.body.data.name).toBe('City Care Medical Center');
      expect(Array.isArray(response.body.data.resources)).toBe(true);
      expect(Array.isArray(response.body.data.serviceTypes)).toBe(true);
    });
  });
});
