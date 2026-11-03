import { AppointmentService } from './appointment.service';
import { prisma } from './db.service';
import { TRANSACTION_OPTIONS } from '../config/timeouts';
import { calComService } from './calcom.service';
import { slotCacheService, SlotCacheService } from './slot-cache.service';


export interface ToolCallInput {
  name: string;
  arguments: any;
  toolCallId: string;
}

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
   * Fast availability slot check for Voice AI Agent (<50ms target)
   */
  public static async checkCalComAvailability(
    tenantId?: string,
    username: string = 'dr-sarah-jenkins',
    date?: string,
    timeZone: string = 'America/New_York'
  ): Promise<{ responseText: string; availableSlots: string[]; executionTimeMs: number; cached?: boolean }> {
    const startTime = Date.now();
    const targetDate = date || new Date().toISOString().split('T')[0];
    const cacheKey = SlotCacheService.buildKey(tenantId || 'no-tenant', username, targetDate, timeZone);

    // 1. Check ultra-fast slot cache (<5ms)
    const cachedResult = slotCacheService.get<{ responseText: string; availableSlots: string[] }>(cacheKey);
    if (cachedResult) {
      const executionTimeMs = Date.now() - startTime;
      console.log(`⚡ [SlotCacheService] Cache HIT for key '${cacheKey}' in ${executionTimeMs}ms`);
      return {
        ...cachedResult,
        executionTimeMs,
        cached: true,
      };
    }

    try {
      const slotsData = (await calComService.getAvailableSlots({
        username,
        startTime: `${targetDate}T00:00:00Z`,
        endTime: `${targetDate}T23:59:59Z`,
        timeZone,
      })) as any;

      // Never invent slots. If Cal.com has none for the day, say so.
      const slots: Array<{ time: string }> = slotsData?.data?.slots?.[targetDate] || [];

      const formattedTimes = slots.map((s) => {
        const timeObj = new Date(s.time);
        return timeObj.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone,
        });
      });

      const responseText = formattedTimes.length > 0
        ? `Available appointment slots for ${targetDate} are at ${formattedTimes.join(', ')}. Which time works best for you?`
        : `There are no available appointment slots on ${targetDate}. Would you like to try another day?`;
      const executionTimeMs = Date.now() - startTime;

      const result = {
        responseText,
        availableSlots: formattedTimes,
      };

      // Store in cache with 30-second TTL
      slotCacheService.set(cacheKey, result, 30);

      return {
        ...result,
        executionTimeMs,
        cached: false,
      };
    } catch (error) {
      // Do not offer made-up slots: a caller could book a time that does not exist.
      console.warn('[VoiceService] CalCom availability lookup failed:', error);
      const executionTimeMs = Date.now() - startTime;
      return {
        responseText: 'I am unable to check the calendar right now. Please try again in a moment, or I can take your details and have someone call you back.',
        availableSlots: [],
        executionTimeMs,
        cached: false,
      };
    }
  }
}


