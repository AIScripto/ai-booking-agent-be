import { AppointmentService } from './appointment.service';
import { prisma } from './db.service';

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
    console.log(`[VoiceService] Executing tool: ${name} with args:`, args);

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

    // 1. If callSid is provided, check if it's already in the database
    if (callSid) {
      const existing = await prisma.callLog.findFirst({
        where: { tenantId, callSid },
      });

      if (existing) {
        await prisma.callLog.update({
          where: { id: existing.id },
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
    }

    // 2. Otherwise, create a new CallLog row
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
}
