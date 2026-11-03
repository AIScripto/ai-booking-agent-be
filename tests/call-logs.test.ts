import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/services/db.service';
import { createStaff, removeStaff, bearer, TestStaff } from './helpers/auth';

describe('Call logs and tenant branding (SEC-001, SEC-003)', () => {
  const tenantA = '3f1c8a52-0b7d-4c1e-9a55-6d2e7b1f0b01';
  const tenantB = '3f1c8a52-0b7d-4c1e-9a55-6d2e7b1f0b02';
  let logId: string;
  let adminA: TestStaff;
  let adminB: TestStaff;

  beforeAll(async () => {
    for (const id of [tenantA, tenantB]) {
      await prisma.tenant.upsert({
        where: { id },
        update: {},
        create: { id, name: `Call Log Test ${id.slice(-2)}`, industry: 'HEALTHCARE', calApiKey: 'secret-cal-key' },
      });
    }
    await prisma.callLog.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
    const log = await prisma.callLog.create({
      data: {
        tenantId: tenantA,
        status: 'completed',
        transcript: 'secret transcript text',
        payload: { secret: 'payload value' },
        customerName: 'Test Caller',
      },
    });
    logId = log.id;
    adminA = await createStaff(tenantA, 'ADMIN');
    adminB = await createStaff(tenantB, 'ADMIN');
  });

  afterAll(async () => {
    await removeStaff(adminA, adminB);
    await prisma.callLog.deleteMany({ where: { tenantId: { in: [tenantA, tenantB] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [tenantA, tenantB] } } });
  });

  it('list does not return transcript or payload', async () => {
    const res = await request(app).get('/api/v1/appointments/logs').set(bearer(adminA));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).not.toHaveProperty('transcript');
    expect(res.body.data[0]).not.toHaveProperty('payload');
    expect(res.body.data[0].customerName).toBe('Test Caller');
  });

  it('detail returns transcript and payload for the owning tenant', async () => {
    const res = await request(app).get(`/api/v1/appointments/logs/${logId}`).set(bearer(adminA));
    expect(res.status).toBe(200);
    expect(res.body.data.transcript).toBe('secret transcript text');
    expect(res.body.data.payload).toEqual({ secret: 'payload value' });
  });

  it('detail returns 404 when another tenant asks for the log', async () => {
    const res = await request(app).get(`/api/v1/appointments/logs/${logId}`).set(bearer(adminB));
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });

  it('detail returns 400 for an id that is not a UUID', async () => {
    const res = await request(app).get('/api/v1/appointments/logs/not-a-uuid').set(bearer(adminA));
    expect(res.status).toBe(400);
  });

  it('branding update rejects an unknown industry', async () => {
    const res = await request(app)
      .put('/api/v1/tenant/branding')
      .set(bearer(adminA))
      .send({ industry: 'NOT_AN_INDUSTRY' });
    expect(res.status).toBe(400);
  });

  it('branding update never returns calApiKey', async () => {
    const res = await request(app)
      .put('/api/v1/tenant/branding')
      .set(bearer(adminA))
      .send({ industry: 'FITNESS', branding: { color: 'blue' } });
    expect(res.status).toBe(200);
    expect(res.body.data.industry).toBe('FITNESS');
    expect(res.body.data).not.toHaveProperty('calApiKey');
    expect(JSON.stringify(res.body)).not.toContain('secret-cal-key');
  });
});
