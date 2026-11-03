import { AppointmentService } from './appointment.service';
import { prisma } from './db.service';
import { TRANSACTION_OPTIONS } from '../config/timeouts';
import { AvailabilityService, AvailabilityUnavailableError, todayIn } from './availability.service';
import { config } from '../config';
import { slotCacheService, SlotCacheService } from './slot-cache.service';


export interface ToolCallInput {
  name: string;
  arguments: any;
  toolCallId: string;
}

/** The agent reads times aloud, so a long list is not helpful. */
const MAX_SPOKEN_SLOTS = 6;

export class VoiceService {

  /**
   * Main entrypoint for processing voice webhook events.
   * Handles Vapi/Retell tool calls, processes database updates, and posts logs asynchronously.
   */
  public static async processWebhook(
    tenantId: string,
    calendarId: string,
    payload: any
  ): Promise<any> {
    const messageType = payload.message?.type || payload.type;
    const callSid = payload.message?.call?.id || payload.call_id || payload.call?.id;

    // Log the incoming call payload asynchronously to prevent request blocking
    this.asyncLogCall(tenantId, callSid, payload).catch((err) =>
      console.error('[VoiceService] Error creating call log:', err)
    );

    // Detect and handle flat Custom Tool Call format
    if (!messageType && payload.dateTime) {
      const isBooking = !!(payload.customerPhone || payload.customerName);
      const toolName = isBooking ? 'bookAppointment' : 'checkAvailability';
      console.log(`[VoiceService] Detected flat Custom Tool Call for: ${toolName}`);
      
      const result = await this.executeTool(tenantId, calendarId, {
        name: toolName,
        arguments: payload,
        toolCallId: 'flat-tool-call',
      });
      return result;
    }

    // 1. Check if it's a Vapi Tool Call
    if (messageType === 'tool-calls') {
      const toolCalls = payload.message.toolCalls || [];
      const results = [];

      for (const tc of toolCalls) {
        const toolName = tc.function?.name || tc.name;
        const args = tc.function?.arguments || tc.arguments || {};
        const toolCallId = tc.id;

        const result = await this.executeTool(tenantId, calendarId, {
          name: toolName,
          arguments: args,
          toolCallId,
        });

        results.push({
          toolCallId,
          result,
        });
      }

      return { results };
    }

    // 2. Check if it's a Retell/Generic Tool Call (where tool call is directly in the root)
    if (payload.name && payload.tool_call_id) {
      const result = await this.executeTool(tenantId, calendarId, {
        name: payload.name,
        arguments: payload.arguments || {},
        toolCallId: payload.tool_call_id,
      });
      return result;
    }

    // 3. Fallback response for status updates, transcriptions, or assistant configuration requests
    return { status: 'ignored_or_processed' };
  }

  /**
   * Executes a single tool request by routing it to the appropriate service.
   */
  private static async executeTool(
    tenantId: string,
    calendarId: string,
    toolCall: ToolCallInput
  ): Promise<any> {
    const { name, arguments: args } = toolCall;
    console.log(`[VoiceService] Executing tool: ${name}`);

    try {
      switch (name) {
        case 'checkAvailability': {
          const { dateTime } = args;
          if (!dateTime) {
            return { success: false, message: 'dateTime parameter is required.' };
          }
          const parsedDate = new Date(dateTime);
          if (isNaN(parsedDate.getTime())) {
            return { success: false, message: 'Invalid dateTime format.' };
          }

          const available = await AppointmentService.checkAvailability(
            tenantId,
            calendarId,
            parsedDate
          );

          return {
            available,
            message: available
              ? 'Slot is available for booking.'
              : 'Slot is not available. Please propose another time.',
          };
        }

        case 'bookAppointment': {
          const { dateTime, customerName, customerPhone, customerEmail } = args;
          if (!dateTime || !customerName || !customerPhone) {
            return {
              success: false,
              message: 'dateTime, customerName, and customerPhone are required parameters.',
            };
          }

          const parsedDate = new Date(dateTime);
          if (isNaN(parsedDate.getTime())) {
            return { success: false, message: 'Invalid dateTime format.' };
          }

          const appointment = await AppointmentService.createAppointment(tenantId, {
            calendarId,
            appointmentDateTime: parsedDate,
            customerName,
            customerPhone,
            customerEmail: customerEmail || null,
          });

          return {
            success: true,
            appointmentId: appointment.id,
            message: `Appointment successfully booked for ${customerName} at ${parsedDate.toISOString()}.`,
          };
        }

        default:
          return {
            success: false,
            message: `Unknown tool execution request: ${name}`,
          };
      }
    } catch (error: any) {
      console.error(`[VoiceService] Error executing tool ${name}:`, error);
      return {
        success: false,
        message: error.message || 'An error occurred during tool execution.',
      };
    }
  }

  /**
   * Asynchronously saves call webhook metadata to the database, ensuring zero execution blockages.
   */
  private static async asyncLogCall(
    tenantId: string,
    callSid: string | undefined,
    payload: any
  ): Promise<void> {
    const messageType = payload.message?.type || payload.type || 'unknown';
    const status = payload.message?.status || payload.status || 'active';
    
    // Extract customer phone
    const customerPhone = 
      payload.message?.customer?.number || 
      payload.customer?.number || 
      payload.message?.call?.customer?.number || 
      null;

    // Extract customer name
    const customerName = 
      payload.message?.customer?.name || 
      payload.customer?.name || 
      null;

    // Extract customer email
    const customerEmail = 
      payload.message?.customer?.email || 
      payload.customer?.email || 
      null;

    // Extract purpose (summary of call from end-of-call analysis)
    const purpose = 
      payload.message?.analysis?.summary || 
      payload.analysis?.summary || 
      payload.message?.analysis?.structuredData?.Purpose ||
      payload.message?.analysis?.structuredData?.purpose ||
      null;

    // Extract transcript
    const transcript = 
      payload.message?.transcript || 
      payload.transcript || 
      payload.message?.call?.transcript || 
      null;

    // Extract duration
    const duration = 
      payload.message?.duration || 
      payload.duration || 
      payload.message?.call?.duration || 
      null;

    // Map webhook event status to simplified state
    let callStatus = 'in-progress';
    if (messageType === 'end-of-call-report' || status === 'ended' || payload.message?.status === 'ended') {
      callStatus = 'completed';
    } else if (status === 'failed') {
      callStatus = 'failed';
    }

    // Proactively fill in patient details using their booking if missing from Vapi profile
    let finalCustomerName = customerName;
    let finalCustomerEmail = customerEmail;
    if (customerPhone && (!finalCustomerName || !finalCustomerEmail)) {
      const latestAppt = await prisma.appointment.findFirst({
        where: { tenantId, customerPhone },
        orderBy: { createdAt: 'desc' },
      });
      if (latestAppt) {
        if (!finalCustomerName) finalCustomerName = latestAppt.customerName;
        if (!finalCustomerEmail) finalCustomerEmail = latestAppt.customerEmail;
      }
    }

    // 1. If callSid is provided, there must be exactly one row per (tenant, call).
    // Events for one call can arrive together. A transaction-scoped database lock keyed on
    // the tenant and call makes them queue up, so find-then-write cannot create two rows.
    if (callSid) {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}), hashtext(${callSid}))`;

        const existing = await tx.callLog.findFirst({
          where: { tenantId, callSid },
        });

        if (existing) {
          await tx.callLog.updateMany({
            where: { id: existing.id, tenantId },
            data: {
              status: callStatus,
              transcript: transcript || existing.transcript,
              duration: duration ? Math.round(duration) : existing.duration,
              customerName: finalCustomerName || existing.customerName,
              customerPhone: customerPhone || existing.customerPhone,
              customerEmail: finalCustomerEmail || existing.customerEmail,
              purpose: purpose || existing.purpose,
              payload: payload,
            },
          });
          return;
        }

        await tx.callLog.create({
          data: {
            tenantId,
            callSid,
            status: callStatus,
            duration: duration ? Math.round(duration) : null,
            transcript,
            customerName: finalCustomerName,
            customerPhone,
            customerEmail: finalCustomerEmail,
            purpose,
            payload: payload,
          },
        });
      }, TRANSACTION_OPTIONS);
      return;
    }

    // 2. No call id: nothing to match on, so create a new CallLog row
    await prisma.callLog.create({
      data: {
        tenantId,
        callSid: callSid || null,
        status: callStatus,
        duration: duration ? Math.round(duration) : null,
        transcript,
        customerName: finalCustomerName,
        customerPhone,
        customerEmail: finalCustomerEmail,
        purpose,
        payload: payload,
      },
    });
  }

  /**
   * Free appointment times for one date, for the voice agent to read out.
   *
   * One source of truth (decision D3): the local appointments table plus Google Calendar, the same
   * places a booking is checked against, so every time offered here can be booked. Cal.com is not
   * asked. If the calendar cannot be read the answer says so; times are never guessed.
   *
   * `availableSlots` are the spoken labels and `availableSlotsIso` the same times in UTC, in the same
   * order, for the agent to pass to bookAppointment. At most MAX_SPOKEN_SLOTS are returned.
   */
  public static async checkAvailabilitySlots(
    tenantId: string,
    calendarId: string,
    date?: string,
    timeZone: string = config.DEFAULT_TIME_ZONE
  ): Promise<{
    responseText: string;
    availableSlots: string[];
    availableSlotsIso: string[];
    totalFree: number;
    executionTimeMs: number;
    cached?: boolean;
  }> {
    const startTime = Date.now();
    const targetDate = date || todayIn(timeZone);
    const cacheKey = SlotCacheService.buildKey(tenantId, calendarId, targetDate, timeZone);

    type Answer = Omit<Awaited<ReturnType<typeof VoiceService.checkAvailabilitySlots>>, 'executionTimeMs' | 'cached'>;
    const cachedResult = slotCacheService.get<Answer>(cacheKey);
    if (cachedResult) {
      return { ...cachedResult, executionTimeMs: Date.now() - startTime, cached: true };
    }

    try {
      const { closed, slots } = await AvailabilityService.getFreeSlots(tenantId, calendarId, targetDate, timeZone);

      const spoken = slots.slice(0, MAX_SPOKEN_SLOTS);
      const labels = spoken.map((slot) =>
        slot.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone })
      );

      let responseText: string;
      if (closed) {
        responseText = `We are closed on ${targetDate}. Would you like to try another day?`;
      } else if (slots.length === 0) {
        responseText = `There are no available appointment slots on ${targetDate}. Would you like to try another day?`;
      } else {
        const more = slots.length > spoken.length ? ` There are ${slots.length - spoken.length} more times if none of these suit you.` : '';
        responseText = `Available appointment slots for ${targetDate} are at ${labels.join(', ')}.${more} Which time works best for you?`;
      }

      const answer: Answer = {
        responseText,
        availableSlots: labels,
        availableSlotsIso: spoken.map((slot) => slot.toISOString()),
        totalFree: slots.length,
      };
      slotCacheService.set(cacheKey, answer, 30);
      return { ...answer, executionTimeMs: Date.now() - startTime, cached: false };
    } catch (error) {
      // Do not offer made-up slots: a caller could book a time that does not exist.
      if (!(error instanceof AvailabilityUnavailableError)) {
        console.warn('[VoiceService] Availability lookup failed:', error);
      }
      return {
        responseText:
          'I am unable to check the calendar right now. Please try again in a moment, or I can take your details and have someone call you back.',
        availableSlots: [],
        availableSlotsIso: [],
        totalFree: 0,
        executionTimeMs: Date.now() - startTime,
        cached: false,
      };
    }
  }
}


