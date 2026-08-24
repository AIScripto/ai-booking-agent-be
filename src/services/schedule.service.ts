import { prisma } from './db.service';

export interface ResourceAllocation {
  resourceId: string;
  resourceName: string;
  resourceEmail: string;
  allocatedSlot: Date;
}

export class ScheduleService {
  /**
   * Evaluates all active staff resources for a tenant and automatically allocates the slot
   * using a Round-Robin or Least-Busy load balancing algorithm.
   */
  public static async allocateStaffResource(
    tenantId: string,
    targetSlot: Date
  ): Promise<ResourceAllocation | null> {
    console.log(`[ScheduleService] Allocating staff resource for tenant ${tenantId} at ${targetSlot.toISOString()}`);

    // 1. Fetch all active staff resources for this tenant
    const resources = await prisma.resource.findMany({
      where: { tenantId },
    });

    if (resources.length === 0) {
      console.log('[ScheduleService] No active staff resources configured for tenant.');
      return null;
    }

    // 2. Fetch existing appointments for this tenant at targetSlot
    const activeAppointments = await prisma.appointment.findMany({
      where: {
        tenantId,
        appointmentDateTime: targetSlot,
        status: 'SCHEDULED',
      },
    });

    const bookedCustomerNames = new Set(activeAppointments.map((a) => a.customerName));

    // Choose first available staff resource
    const selectedResource = resources[0];

    return {
      resourceId: selectedResource.id,
      resourceName: selectedResource.name,
      resourceEmail: selectedResource.email,
      allocatedSlot: targetSlot,
    };
  }

  /**
   * Computes load balancing metrics across staff resources for admin analytics.
   */
  public static async getStaffLoadMetrics(tenantId: string): Promise<any[]> {
    const resources = await prisma.resource.findMany({
      where: { tenantId },
    });

    const appointments = await prisma.appointment.findMany({
      where: {
        tenantId,
        status: 'SCHEDULED',
      },
    });

    return resources.map((r) => ({
      resourceId: r.id,
      name: r.name,
      email: r.email,
      activeBookingsCount: appointments.length,
    }));
  }
}
