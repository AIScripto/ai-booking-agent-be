import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';

const router = Router();

// Endpoint to generate Google OAuth Consent screen URL
router.get('/google', AuthController.getAuthUrl);

// Google OAuth redirect callback endpoint
router.get('/google/callback', AuthController.googleCallback);

export const authRouter = router;
