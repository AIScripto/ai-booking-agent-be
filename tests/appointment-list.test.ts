import request from 'supertest';
import app from '../src/app';
import { prisma } from '../src/services/db.service';
import { createStaff, removeStaff, bearer, TestStaff } from './helpers/auth';

describe('Appointments by date use the business day, not the UTC day (UXD-003)', () => {
  const tenantId = '3f1c8a52-0b7d-4c1e-9a55-6d2e7b1f2001';
  const calendarId = 'list-by-date-test';
  let staff: TestStaff;

  beforeAll(async () => {
    await prisma.tenant.upsert({ where: { id: tenantId }, update: {}, create: { id: tenantId, name: 'List By Date Test', industry: 'HEALTHCARE' } });
    await prisma.appointment.deleteMany({ where: { tenantId } });
    staff = await createStaff(tenantId, 'FRONT_DESK');
    // New York is UTC-4 in August: 23:30 on Aug 10 is 03:30 UTC on Aug 11.
    await prisma.appointment.createMany({
      data: [
        { tenantId, calendarId, appointmentDateTime: new Date('2031-08-11T03:30:00.000Z'), customerName: 'Late evening Aug 10', customerPhone: '+10000000091', status: 'SCHEDULED' },
        { tenantId, calendarId, appointmentDateTime: new Date('2031-08-11T13:00:00.000Z'), customerName: 'Morning Aug 11', customerPhone: '+10000000092', status: 'SCHEDULED' },
      ],
    });
  });

  afterAll(async () => {
    await prisma.appointment.deleteMany({ where: { tenantId } });
    await removeStaff(staff);
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  });

  const names = async (date: string) => {
    const res = await request(app).get(`/api/v1/appointments?date=${date}`).set(bearer(staff));
    if (res.status !== 200) throw new Error(`Unexpected answer ${res.status}: ${JSON.stringify(res.body)}`);
    return res.body.data.map((a: { customerName: string }) => a.customerName);
  };

  it('puts a late-evening appointment on its own day, not on the next UTC day', async () => {
    expect(await names('2031-08-10')).toEqual(['Late evening Aug 10']);
    expect(await names('2031-08-11')).toEqual(['Morning Aug 11']);
  });

  it('without a date it lists every scheduled appointment, in time order', async () => {
    const res = await request(app).get('/api/v1/appointments').set(bearer(staff));
    expect(res.body.data.map((a: { customerName: string }) => a.customerName)).toEqual(['Late evening Aug 10', 'Morning Aug 11']);
  });

  it('ignores a date that is not a real date (no filter, not an error)', async () => {
    const res = await request(app).get('/api/v1/appointments?date=2031-02-30').set(bearer(staff));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
  });
});
