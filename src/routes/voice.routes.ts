import { Router } from 'express';
import { VoiceController } from '../controllers/voice.controller';

const router = Router();

// Endpoint for Vapi/Retell tool calling and events
router.post('/webhook', VoiceController.handleWebhook);

// High-speed endpoint for Voice AI slot availability check
router.get('/check-availability', VoiceController.checkAvailability);
router.post('/check-availability', VoiceController.checkAvailability);

export const voiceRouter = router;

