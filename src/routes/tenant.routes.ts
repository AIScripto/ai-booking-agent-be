import { Router } from 'express';
import { TenantController } from '../controllers/tenant.controller';

const router = Router();

router.get('/vocabulary', TenantController.getVocabulary);
router.get('/branding', TenantController.getBranding);
router.put('/branding', TenantController.updateBranding);
router.post('/resources', TenantController.onboardResource);
router.delete('/resources/:id', TenantController.offboardResource);

export const tenantRouter = router;

