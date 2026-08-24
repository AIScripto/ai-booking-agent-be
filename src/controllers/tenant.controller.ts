import { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/db.service';
import { getVocabulary } from '../config/industry-vocabulary';
import { slotCacheService } from '../services/slot-cache.service';


export class TenantController {
  /**
   * GET /api/v1/tenant/vocabulary?tenant_id=uuid
   */
  public static async getVocabulary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = (req.query.tenant_id as string) || (req.query.tenantId as string);

      if (!tenantId) {
        res.status(400).json({ status: 'error', message: 'tenant_id query parameter is required.' });
        return;
      }

      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
      const vocabulary = getVocabulary(tenant?.industry || 'GENERAL');

      res.status(200).json({
        status: 'success',
        data: {
          tenantId,
          tenantName: tenant?.name || 'Default Tenant',
          industry: tenant?.industry || 'GENERAL',
          vocabulary,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/tenant/branding?tenant_id=uuid
   */
  public static async getBranding(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = (req.query.tenant_id as string) || (req.query.tenantId as string);

      if (!tenantId) {
        res.status(400).json({ status: 'error', message: 'tenant_id query parameter is required.' });
        return;
      }

      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        include: {
          resources: {
            where: { isActive: true },
            include: { department: true },
          },

          serviceTypes: true,
          departments: true,
        },
      });

      if (!tenant) {
        res.status(404).json({ status: 'error', message: 'Tenant not found.' });
        return;
      }

      res.status(200).json({
        status: 'success',
        data: {
          tenantId: tenant.id,
          name: tenant.name,
          industry: tenant.industry,
          branding: tenant.branding,
          resources: tenant.resources,
          serviceTypes: tenant.serviceTypes,
          departments: tenant.departments,
        },
      });

    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/tenant/branding
   */
  public static async updateBranding(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { tenantId, industry, branding } = req.body;

      if (!tenantId) {
        res.status(400).json({ status: 'error', message: 'tenantId is required in body.' });
        return;
      }

      const updated = await prisma.tenant.update({
        where: { id: tenantId },
        data: {
          industry: industry || undefined,
          branding: branding || undefined,
        },
      });

      res.status(200).json({
        status: 'success',
        message: 'Tenant branding and preset updated successfully.',
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/tenant/resources (Onboard New Doctor / Consultant)
   */
  public static async onboardResource(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tenantId = (req.body.tenantId as string) || (req.query.tenant_id as string);
      const { name, email, title } = req.body;

      if (!tenantId || !name || !email) {
        res.status(400).json({ status: 'error', message: 'tenantId, name, and email are required fields.' });
        return;
      }

      const resource = await prisma.resource.create({
        data: {
          tenantId,
          name,
          email,
          title: title || 'Specialist Consultant',
        },
      });

      // Purge slot cache for tenant so Voice AI immediately sees new doctor
      slotCacheService.invalidate();


      res.status(201).json({
        status: 'success',
        message: 'Doctor / Consultant onboarded successfully.',
        data: resource,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/tenant/resources/:id (Offboard Doctor / Consultant)
   */
  public static async offboardResource(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ status: 'error', message: 'Resource ID path parameter is required.' });
        return;
      }

      // Pro-level soft deletion: Mark doctor as inactive to preserve HIPAA historical records
      await prisma.resource.update({
        where: { id },
        data: { isActive: false },
      });


      // Purge slot cache so Voice AI instantly stops offering slots for offboarded doctor
      slotCacheService.invalidate();


      res.status(200).json({
        status: 'success',
        message: 'Doctor / Consultant offboarded successfully.',
      });
    } catch (error) {
      next(error);
    }
  }
}

