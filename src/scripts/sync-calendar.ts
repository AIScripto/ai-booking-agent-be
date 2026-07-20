import { PrismaClient } from '@prisma/client';
import { google } from 'googleapis';
import { config } from '../config';

const prisma = new PrismaClient();

async function syncCalendar() {
  console.log('🔄 Starting Google Calendar to database sync...');

  // Default Tenant UUID
  const tenantId = '9eb441c7-f788-4137-8043-d4d7c3080879';
  const calendarId = 'primary';

  // 1. Get Google Credentials
  const credentials = await prisma.googleCredential.findUnique({
    where: { tenantId },
  });

  if (!credentials) {
    console.error('❌ No Google credentials found in the database. Please connect your calendar first.');
    process.exit(1);
  }

  // 2. Initialize OAuth client
  const oauth2Client = new google.auth.OAuth2(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    config.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    access_token: credentials.accessToken,
    refresh_token: credentials.refreshToken,
    expiry_date: credentials.expiryDate.getTime(),
  });

  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

  // 3. Fetch events from Google Calendar
  console.log(`📅 Fetching events from Google Calendar (${calendarId})...`);
  const response = await calendar.events.list({
    calendarId,
    singleEvents: true,
    orderBy: 'startTime',
    timeMin: new Date('2026-07-01T00:00:00Z').toISOString(), // Filter for July 2026
    timeMax: new Date('2026-07-31T23:59:59Z').toISOString(),
  });

  const events = response.data.items || [];
  console.log(`Found ${events.length} events on Google Calendar.`);

  let syncedCount = 0;

  for (const event of events) {
    const summary = event.summary || '';
    if (!summary.startsWith('Appointment:')) {
      continue; // Skip non-booking events
    }

    const googleEventId = event.id!;
    
    // Check if we already have this event in our database
    const existing = await prisma.appointment.findFirst({
      where: { googleEventId },
    });

    if (existing) {
      console.log(`➖ Event already synced: "${summary}" (${event.start?.dateTime})`);
      continue;
    }

    // Parse description for customer details
    const description = event.description || '';
    const nameMatch = summary.replace('Appointment:', '').trim();
    
    const phoneMatch = description.match(/Phone:\s*(\+?\d+)/i);
    const emailMatch = description.match(/Email:\s*([^\n\r]+)/i);

    const customerName = nameMatch || 'Unknown Patient';
    const customerPhone = phoneMatch ? phoneMatch[1] : '+920000000000';
    const customerEmail = emailMatch && emailMatch[1] !== 'N/A' ? emailMatch[1].trim() : null;

    const startDateTime = event.start?.dateTime || event.start?.date;
    if (!startDateTime) continue;

    console.log(`📥 Syncing new event: "${summary}" at ${startDateTime}`);

    // Insert into database
    await prisma.appointment.create({
      data: {
        tenantId,
        calendarId,
        appointmentDateTime: new Date(startDateTime),
        customerName,
        customerPhone,
        customerEmail,
        status: 'SCHEDULED',
        googleEventId,
      },
    });

    syncedCount++;
  }

  console.log(`✅ Sync finished! Imported ${syncedCount} new appointments to your local database.`);
}

syncCalendar()
  .catch((e) => {
    console.error('❌ Sync failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
