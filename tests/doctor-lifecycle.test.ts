import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/services/db.service';


describe('Doctor Onboarding & Offboarding Lifecycle Integration Tests', () => {
  const testTenantId = '9eb441c7-f788-4137-8043-d4d7c3080879';
  let createdDoctorId: string;

  beforeAll(async () => {
    // Ensure test tenant exists
    await prisma.tenant.upsert({
      where: { id: testTenantId },
      update: {},
      create: {
        id: testTenantId,
        name: 'Test Medical Center',
        industry: 'HEALTHCARE',
      },
    });
  });

  afterAll(async () => {
    if (createdDoctorId) {
      await prisma.resource.deleteMany({ where: { id: createdDoctorId } });
    }
  });

  test('POST /api/v1/tenant/resources - should onboard a new doctor successfully', async () => {
    const res = await request(app)
      .post('/api/v1/tenant/resources')
      .send({
        tenantId: testTenantId,
        name: 'Dr. Gregory House',
        email: 'gregory.house@testmedical.com',
        title: 'Head of Diagnostic Medicine',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('success');
    expect(res.body.data.name).toBe('Dr. Gregory House');
    expect(res.body.data.title).toBe('Head of Diagnostic Medicine');

    createdDoctorId = res.body.data.id;
  });

  test('DELETE /api/v1/tenant/resources/:id - should offboard a doctor successfully', async () => {
    expect(createdDoctorId).toBeDefined();

    const res = await request(app).delete(`/api/v1/tenant/resources/${createdDoctorId}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('success');

    // Confirm doctor was soft-deleted (isActive = false) for HIPAA audit compliance
    const docInDb = await prisma.resource.findUnique({
      where: { id: createdDoctorId },
    });
    expect(docInDb).not.toBeNull();
    expect(docInDb?.isActive).toBe(false);
  });

});
