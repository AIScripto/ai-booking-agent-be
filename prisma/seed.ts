import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Start seeding database...');

  // 1. Clean existing records to avoid duplicates
  await prisma.callLog.deleteMany({});
  await prisma.appointment.deleteMany({});
  await prisma.voiceAgent.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.tenant.deleteMany({});

  // 2. Create Tenant
  const tenant = await prisma.tenant.create({
    data: {
      id: '9eb441c7-f788-4137-8043-d4d7c3080879',
      name: 'Default Dental Clinic',
    },
  });
  console.log(`✅ Created Tenant: ${tenant.name} (${tenant.id})`);

  // 3. Create User
  const user = await prisma.user.create({
    data: {
      id: 'a2b16a24-9b2f-4c80-a330-4e80bff163f9',
      tenantId: tenant.id,
      email: 'admin@dentalclinic.com',
      passwordHash: '$2b$12$MockPasswordHashForSeedingPurposesOnly12345678', // Placeholder
      name: 'Dr. John Smith',
      role: 'ADMIN',
    },
  });
  console.log(`✅ Created User: ${user.name} (${user.email})`);

  // 4. Create Voice Agent
  const agent = await prisma.voiceAgent.create({
    data: {
      id: '4d3e945b-0737-4031-aeaf-a616a777fcb9',
      tenantId: tenant.id,
      name: 'Inbound Booking Assistant',
      systemPrompt: 'You are a professional appointment booking voice assistant for Default Dental Clinic. Your job is to help patients check slot availability and schedule their appointments.',
      voiceProvider: 'vapi',
      voiceAgentId: 'vapi-agent-dental-123',
      calendarId: 'primary',
    },
  });
  console.log(`✅ Created Voice Agent: ${agent.name} (${agent.id})`);

  // 5. Create Mock Google Credential
  const googleCredential = await prisma.googleCredential.create({
    data: {
      tenantId: tenant.id,
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      expiryDate: new Date(Date.now() + 365 * 24 * 3600 * 1000), // 1 year expiry
    },
  });
  console.log(`✅ Created Mock Google Credentials for Tenant: ${tenant.id}`);

  console.log('🌱 Seeding finished successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
