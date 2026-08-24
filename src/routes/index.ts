import { Router } from 'express';
import { voiceRouter } from './voice.routes';
import { authRouter } from './auth.routes';
import { appointmentRouter } from './appointment.routes';
import { tenantRouter } from './tenant.routes';

const router = Router();

// Aggregate API version 1 routes
router.use('/voice', voiceRouter);
router.use('/auth', authRouter);
router.use('/appointments', appointmentRouter);
router.use('/tenant', tenantRouter);

export const apiRouter = router;

