import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Start seeding universal database...');

  // 1. Clean existing records in reverse dependency order
  await prisma.booking.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.serviceType.deleteMany({});
  await prisma.resource.deleteMany({});
  await prisma.callLog.deleteMany({});
  await prisma.appointment.deleteMany({});
  await prisma.voiceAgent.deleteMany({});
  await prisma.googleCredential.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.tenant.deleteMany({});

  // 2. Create Healthcare Tenant
  const tenant = await prisma.tenant.create({
    data: {
      id: '9eb441c7-f788-4137-8043-d4d7c3080879',
      name: 'City Care Medical Center',
      industry: 'HEALTHCARE',
      branding: {
        primaryColor: '#0ea5e9', // Sky blue theme
        logoUrl: 'https://assets.example.com/logo.png',
        labels: {
          resourceLabel: 'Doctor / Specialist',
          customerLabel: 'Patient',
          serviceLabel: 'Consultation',
        },
      },
    },
  });
  console.log(`✅ Created Tenant: ${tenant.name} (${tenant.id}) [Industry: ${tenant.industry}]`);

  // 3. Create Admin User
  const userAdmin = await prisma.user.create({
    data: {
      id: 'a2b16a24-9b2f-4c80-a330-4e80bff163f9',
      tenantId: tenant.id,
      email: 'admin@citycaremedical.com',
      passwordHash: '$2b$12$MockPasswordHashForSeedingPurposesOnly12345678',
      name: 'Dr. Sarah Jenkins (Admin)',
      role: 'ADMIN',
    },
  });
  console.log(`✅ Created Admin User: ${userAdmin.name} (${userAdmin.email}) [Role: ${userAdmin.role}]`);

  // 3.5 Create Departments
  await prisma.department.deleteMany({});

  const deptCardiology = await prisma.department.create({
    data: {
      tenantId: tenant.id,
      name: 'Cardiology',
      code: 'CARD-01',
      description: 'Comprehensive cardiovascular care & surgery.',
      buildingLocation: 'Building A, Floor 3',
      isHipaaRestricted: true,
      maxDailyBookings: 20,
    },
  });

  const deptGeneral = await prisma.department.create({
    data: {
      tenantId: tenant.id,
      name: 'General Medicine',
      code: 'GEN-01',
      description: 'Primary healthcare and annual physical checkups.',
      buildingLocation: 'Building B, Floor 1',
      isHipaaRestricted: true,
      maxDailyBookings: 35,
    },
  });

  const deptPediatrics = await prisma.department.create({
    data: {
      tenantId: tenant.id,
      name: 'Pediatrics',
      code: 'PED-01',
      description: 'Child healthcare and adolescent specialist consultations.',
      buildingLocation: 'Building C, Floor 2',
      isHipaaRestricted: true,
      maxDailyBookings: 25,
    },
  });
  console.log(`✅ Created Departments: ${deptCardiology.name}, ${deptGeneral.name}, ${deptPediatrics.name}`);

  // 4. Create Doctor Resources (Staff Members) & Provider Accounts
  const resource1 = await prisma.resource.create({
    data: {
      id: '11111111-1111-1111-1111-111111111111',
      tenantId: tenant.id,
      departmentId: deptCardiology.id,
      name: 'Dr. Sarah Jenkins',
      email: 'sarah.jenkins@citycaremedical.com',
      title: 'Chief Cardiologist & Specialist',
      calUserId: 101,
      calScheduleId: 501,
    },
  });

  const resource2 = await prisma.resource.create({
    data: {
      id: '11111111-2222-3333-4444-555555555555',
      tenantId: tenant.id,
      departmentId: deptGeneral.id,
      name: 'Dr. Marcus Vance',
      email: 'marcus.vance@citycaremedical.com',
      title: 'Senior General Practitioner',
      calUserId: 102,
      calScheduleId: 502,
    },
  });

  const resource3 = await prisma.resource.create({
    data: {
      id: '11111111-3333-4444-5555-666666666666',
      tenantId: tenant.id,
      departmentId: deptPediatrics.id,
      name: 'Dr. Emily Chen',
      email: 'emily.chen@citycaremedical.com',
      title: 'Pediatrics & Adolescent Specialist',
      calUserId: 103,
      calScheduleId: 503,
    },
  });

  // Create Provider User Login for Dr. Marcus Vance
  const userProvider = await prisma.user.create({
    data: {
      id: 'b3c27b35-0c30-5d91-b441-5f91caa274ea',
      tenantId: tenant.id,
      resourceId: resource2.id,
      email: 'marcus.vance@citycaremedical.com',
      passwordHash: '$2b$12$MockPasswordHashForSeedingPurposesOnly12345678',
      name: 'Dr. Marcus Vance',
      role: 'PROVIDER',
    },
  });

  console.log(`✅ Created Provider User: ${userProvider.name} (${userProvider.email}) [Role: ${userProvider.role}]`);


  console.log(`✅ Created Doctor Resources: ${resource1.name}, ${resource2.name}, ${resource3.name}`);


  // 5. Create Service Types (Offered Services)
  const serviceType = await prisma.serviceType.create({
    data: {
      id: '22222222-2222-2222-2222-222222222222',
      tenantId: tenant.id,
      name: 'General Medical Consultation',
      description: '30-minute in-person comprehensive medical checkup and consultation.',
      durationMinutes: 30,
      price: 150.00,
      depositRequired: 50.00,
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
  console.log(`✅ Created Service Type: ${serviceType.name} ($${serviceType.price})`);

  // 6. Create Customer (Patient Profile)
  const customer = await prisma.customer.create({
    data: {
      id: '33333333-3333-3333-3333-333333333333',
      tenantId: tenant.id,
      name: 'Robert Chen',
      phone: '+15550192',
      email: 'robert.chen@example.com',
      metadata: {
        dob: '1988-04-12',
        preferredLanguage: 'English',
      },
    },
  });
  console.log(`✅ Created Customer (Patient): ${customer.name} (${customer.phone})`);

  // 7. Create Voice Agent
  const agent = await prisma.voiceAgent.create({
    data: {
      id: '4d3e945b-0737-4031-aeaf-a616a777fcb9',
      tenantId: tenant.id,
      name: 'City Care AI Receptionist',
      systemPrompt: 'You are the 24/7 AI Receptionist for City Care Medical Center. You help patients check doctor availability and book consultations.',
      voiceProvider: 'vapi',
      voiceAgentId: 'vapi-agent-citycare-123',
      calendarId: 'primary',
    },
  });
  console.log(`✅ Created Voice Agent: ${agent.name} (${agent.id})`);

  // 8. Create Sample Booking Record
  const bookingDate = new Date();
  bookingDate.setDate(bookingDate.getDate() + 1); // Tomorrow
  bookingDate.setHours(10, 0, 0, 0); // 10:00 AM

  const booking = await prisma.booking.create({
    data: {
      id: '44444444-4444-4444-4444-444444444444',
      tenantId: tenant.id,
      resourceId: resource1.id,

      serviceTypeId: serviceType.id,
      customerId: customer.id,
      calBookingId: 99901,
      calUid: 'cal-booking-uid-99901',
      bookingDateTime: bookingDate,
      durationMinutes: 30,
      status: 'CONFIRMED',
      intakeData: {
        symptoms: 'Mild chest discomfort and seasonal allergies',
        insuranceId: 'BCBS-994821',
      },
      providerNotes: 'Initial intake completed via 24/7 Voice AI Receptionist.',
    },
  });
  console.log(`✅ Created Sample Booking: ${booking.id} at ${booking.bookingDateTime.toISOString()}`);

  console.log('🌱 Universal database seeding finished successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
