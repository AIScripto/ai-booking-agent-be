import { Router } from 'express';
import { AuthController } from '../controllers/auth.controller';
import { requireAuth, requireRole } from '../middlewares/auth.middleware';
import { loginLimitPerAccount, loginLimitPerAddress } from '../middlewares/login-rate-limit';

const router = Router();

// Sign in with email and password. Failed attempts are rate limited.
router.post('/login', loginLimitPerAddress, loginLimitPerAccount, AuthController.login);

// Who am I (checks that the stored token still works)
router.get('/me', requireAuth, AuthController.me);

// Endpoint to generate Google OAuth Consent screen URL (admins only, own tenant)
router.get('/google', requireAuth, requireRole('ADMIN'), AuthController.getAuthUrl);

// Google OAuth redirect callback endpoint. Public on purpose: Google redirects the browser here.
// It is protected by the signed, expiring, single-use `state` value.
router.get('/google/callback', AuthController.googleCallback);

export const authRouter = router;
