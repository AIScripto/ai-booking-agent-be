import { Router } from 'express';
import { TenantController } from '../controllers/tenant.controller';
import { requireAuth, requireRole, STAFF_ROLES } from '../middlewares/auth.middleware';

const router = Router();

// Every tenant route needs a signed-in user. The tenant comes from the verified token.
router.use(requireAuth);

// Reading: any staff member
router.get('/vocabulary', requireRole(...STAFF_ROLES), TenantController.getVocabulary);
router.get('/branding', requireRole(...STAFF_ROLES), TenantController.getBranding);

// Changing the tenant: admins only
router.put('/branding', requireRole('ADMIN'), TenantController.updateBranding);
router.post('/resources', requireRole('ADMIN'), TenantController.onboardResource);
router.delete('/resources/:id', requireRole('ADMIN'), TenantController.offboardResource);

export const tenantRouter = router;
