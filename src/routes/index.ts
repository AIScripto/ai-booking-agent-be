import { Router } from 'express';
import { voiceRouter } from './voice.routes';
import { authRouter } from './auth.routes';
import { appointmentRouter } from './appointment.routes';

const router = Router();

// Aggregate API version 1 routes
router.use('/voice', voiceRouter);
router.use('/auth', authRouter);
router.use('/appointments', appointmentRouter);

export const apiRouter = router;
