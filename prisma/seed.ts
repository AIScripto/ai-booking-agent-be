/**
 * Demo seed for the City Care healthcare tenant.
 *
 * **Idempotent by design — this script deletes nothing.**
 *
 * It previously opened with an unscoped `deleteMany({})` across every table,
 * including `google_credentials`. That wiped the live Google OAuth refresh token
 * on every run, silently forcing a re-consent to reconnect Calendar, and it took
 * `call_logs` and real `appointments` with it. Re-seeding a demo tenant must
 * never cost a real integration.
 *
 * Everything below is an upsert keyed on a stable id (or a natural unique key),
 * so running it repeatedly converges on the same state. Tables this seed does not
 * own — `googleCredential`, `callLog`, `appointment` — are left untouched.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TENANT_ID = '9eb441c7-f788-4137-8043-d4d7c3080879';
const SEED_PASSWORD_HASH = '$2b$12$MockPasswordHashForSeedingPurposesOnly12345678';

const BRANDING = {
  primaryColor: '#0ea5e9',
  logoUrl: 'https://assets.example.com/logo.png',
  labels: {
    resourceLabel: 'Doctor / Specialist',
    customerLabel: 'Patient',
    serviceLabel: 'Consultation',
  },
};

const DEPARTMENTS = [
  {
    name: 'Cardiology',
    code: 'CARD-01',
    description: 'Comprehensive cardiovascular care & surgery.',
    buildingLocation: 'Building A, Floor 3',
    isHipaaRestricted: true,
    maxDailyBookings: 20,
  },
  {
    name: 'General Medicine',
    code: 'GEN-01',
    description: 'Primary healthcare and annual physical checkups.',
    buildingLocation: 'Building B, Floor 1',
    isHipaaRestricted: true,
    maxDailyBookings: 35,
  },
  {
    name: 'Pediatrics',
    code: 'PED-01',
    description: 'Child healthcare and adolescent specialist consultations.',
    buildingLocation: 'Building C, Floor 2',
    isHipaaRestricted: true,
    maxDailyBookings: 25,
  },
];

async function main() {
  console.log('🌱 Seeding City Care demo tenant (idempotent — nothing is deleted)...');

  // 1. Tenant
  const tenant = await prisma.tenant.upsert({
    where: { id: TENANT_ID },
    update: { name: 'City Care Medical Center', industry: 'HEALTHCARE', branding: BRANDING },
    create: {
      id: TENANT_ID,
      name: 'City Care Medical Center',
      industry: 'HEALTHCARE',
      branding: BRANDING,
    },
  });
  console.log(`✅ Tenant: ${tenant.name} (${tenant.id}) [${tenant.industry}]`);

  // 2. Departments — keyed on their natural unique (tenantId, name).
  const departments: Record<string, string> = {};
  for (const dept of DEPARTMENTS) {
    const row = await prisma.department.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: dept.name } },
      update: { ...dept },
      create: { tenantId: tenant.id, ...dept },
    });
    departments[dept.name] = row.id;
  }
  console.log(`✅ Departments: ${Object.keys(departments).join(', ')}`);

  // 3. Doctor resources
  const resourceSeeds = [
    {
      id: '11111111-1111-1111-1111-111111111111',
      departmentId: departments['Cardiology'],
      name: 'Dr. Sarah Jenkins',
      email: 'sarah.jenkins@citycaremedical.com',
      title: 'Chief Cardiologist & Specialist',
      calUserId: 101,
      calScheduleId: 501,
    },
    {
      id: '11111111-2222-3333-4444-555555555555',
      departmentId: departments['General Medicine'],
      name: 'Dr. Marcus Vance',
      email: 'marcus.vance@citycaremedical.com',
      title: 'Senior General Practitioner',
      calUserId: 102,
      calScheduleId: 502,
    },
    {
      id: '11111111-3333-4444-5555-666666666666',
      departmentId: departments['Pediatrics'],
      name: 'Dr. Emily Chen',
      email: 'emily.chen@citycaremedical.com',
      title: 'Pediatrics & Adolescent Specialist',
      calUserId: 103,
      calScheduleId: 503,
    },
  ];

  for (const seed of resourceSeeds) {
    const { id, ...rest } = seed;
    await prisma.resource.upsert({
      where: { id },
      update: { ...rest },
      create: { id, tenantId: tenant.id, ...rest },
    });
  }
  console.log(`✅ Resources: ${resourceSeeds.map((r) => r.name).join(', ')}`);

  // 4. Users
  await prisma.user.upsert({
    where: { id: 'a2b16a24-9b2f-4c80-a330-4e80bff163f9' },
    update: { name: 'Dr. Sarah Jenkins (Admin)', role: 'ADMIN' },
    create: {
      id: 'a2b16a24-9b2f-4c80-a330-4e80bff163f9',
      tenantId: tenant.id,
      email: 'admin@citycaremedical.com',
      passwordHash: SEED_PASSWORD_HASH,
      name: 'Dr. Sarah Jenkins (Admin)',
      role: 'ADMIN',
    },
  });

  await prisma.user.upsert({
    where: { id: 'b3c27b35-0c30-5d91-b441-5f91caa274ea' },
    update: { name: 'Dr. Marcus Vance', role: 'PROVIDER' },
    create: {
      id: 'b3c27b35-0c30-5d91-b441-5f91caa274ea',
      tenantId: tenant.id,
      resourceId: '11111111-2222-3333-4444-555555555555',
      email: 'marcus.vance@citycaremedical.com',
      passwordHash: SEED_PASSWORD_HASH,
      name: 'Dr. Marcus Vance',
      role: 'PROVIDER',
    },
  });
  console.log('✅ Users: admin@citycaremedical.com, marcus.vance@citycaremedical.com');

  // 5. Service type
  const serviceType = await prisma.serviceType.upsert({
    where: { id: '22222222-2222-2222-2222-222222222222' },
    update: { name: 'General Medical Consultation', durationMinutes: 30, price: 150.0 },
    create: {
      id: '22222222-2222-2222-2222-222222222222',
      tenantId: tenant.id,
      name: 'General Medical Consultation',
      description: '30-minute in-person comprehensive medical checkup and consultation.',
      durationMinutes: 30,
      price: 150.0,
      depositRequired: 50.0,
      calEventTypeId: 1001,
      intakeSchema: {
        type: 'object',
        properties: {
          symptoms: { type: 'string', title: 'Chief Symptoms / Complaint' },
          insuranceId: { type: 'string', title: 'Insurance Member ID' },
        },
        required: ['symptoms'],
      },
    },
  });
  console.log(`✅ Service type: ${serviceType.name}`);

  // 6. Customer
  const customer = await prisma.customer.upsert({
    where: { id: '33333333-3333-3333-3333-333333333333' },
    update: { name: 'Robert Chen', email: 'robert.chen@example.com' },
    create: {
      id: '33333333-3333-3333-3333-333333333333',
      tenantId: tenant.id,
      name: 'Robert Chen',
      phone: '+15550192',
      email: 'robert.chen@example.com',
      metadata: { dob: '1988-04-12', preferredLanguage: 'English' },
    },
  });
  console.log(`✅ Customer: ${customer.name}`);

  // 7. Voice agent
  const agent = await prisma.voiceAgent.upsert({
    where: { id: '4d3e945b-0737-4031-aeaf-a616a777fcb9' },
    update: { name: 'City Care AI Receptionist' },
    create: {
      id: '4d3e945b-0737-4031-aeaf-a616a777fcb9',
      tenantId: tenant.id,
      name: 'City Care AI Receptionist',
      systemPrompt:
        'You are the 24/7 AI Receptionist for City Care Medical Center. You help patients check doctor availability and book consultations.',
      voiceProvider: 'vapi',
      voiceAgentId: 'vapi-agent-citycare-123',
      calendarId: 'primary',
    },
  });
  console.log(`✅ Voice agent: ${agent.name}`);

  // 8. Sample booking, tomorrow at 10:00 local.
  const bookingDateTime = new Date();
  bookingDateTime.setDate(bookingDateTime.getDate() + 1);
  bookingDateTime.setHours(10, 0, 0, 0);

  const booking = await prisma.booking.upsert({
    where: { id: '44444444-4444-4444-4444-444444444444' },
    update: { bookingDateTime, status: 'CONFIRMED' },
    create: {
      id: '44444444-4444-4444-4444-444444444444',
      tenantId: tenant.id,
      resourceId: '11111111-1111-1111-1111-111111111111',
      serviceTypeId: serviceType.id,
      customerId: customer.id,
      calBookingId: 99901,
      calUid: 'cal-booking-uid-99901',
      bookingDateTime,
      durationMinutes: 30,
      status: 'CONFIRMED',
      intakeData: {
        symptoms: 'Mild chest discomfort and seasonal allergies',
        insuranceId: 'BCBS-994821',
      },
      providerNotes: 'Initial intake completed via 24/7 Voice AI Receptionist.',
    },
  });
  console.log(`✅ Booking: ${booking.id} at ${booking.bookingDateTime.toISOString()}`);

  console.log('🌱 Seeding finished. No rows were deleted.');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
