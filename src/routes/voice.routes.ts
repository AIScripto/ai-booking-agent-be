import { Router } from 'express';
import { VoiceController } from '../controllers/voice.controller';

const router = Router();

// Endpoint for Vapi/Retell tool calling and events
router.post('/webhook', VoiceController.handleWebhook);

export const voiceRouter = router;
