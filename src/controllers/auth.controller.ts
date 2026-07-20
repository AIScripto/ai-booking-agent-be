import { Request, Response, NextFunction } from 'express';
import { google } from 'googleapis';
import { config } from '../config';
import { prisma } from '../services/db.service';
import { z } from 'zod';

export class AuthController {
  /**
   * Generates the Google Calendar OAuth Consent URL for a tenant.
   * Query Param: tenant_id (UUID)
   */
  public static async getAuthUrl(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const tenantId = req.query.tenant_id as string;
      if (!tenantId || !z.string().uuid().safeParse(tenantId).success) {
        res.status(400).json({
          status: 'error',
          message: 'A valid tenant_id query parameter is required.',
        });
        return;
      }

      // Verify the tenant exists before generating the URL
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
      });

      if (!tenant) {
        res.status(404).json({
          status: 'error',
          message: 'Tenant not found.',
        });
        return;
      }

      const isGoogleConfigured = 
        config.GOOGLE_CLIENT_ID && 
        config.GOOGLE_CLIENT_ID !== 'your-google-client-id' && 
        !config.GOOGLE_CLIENT_ID.includes('mock') && 
        config.GOOGLE_CLIENT_SECRET && 
        config.GOOGLE_CLIENT_SECRET !== 'your-google-client-secret' && 
        !config.GOOGLE_CLIENT_SECRET.includes('mock');

      if (!isGoogleConfigured) {
        const backendUrl = `${req.protocol}://${req.get('host')}`;
        const authUrl = `${backendUrl}/api/v1/auth/google/callback?code=mock-code&state=${tenantId}`;
        res.status(200).json({
          status: 'success',
          authUrl,
        });
        return;
      }

      const oauth2Client = new google.auth.OAuth2(
        config.GOOGLE_CLIENT_ID,
        config.GOOGLE_CLIENT_SECRET,
        config.GOOGLE_REDIRECT_URI
      );

      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline', // Request permanent refresh token
        prompt: 'consent',     // Force consent screen to guarantee refresh token is returned
        scope: ['https://www.googleapis.com/auth/calendar.events'],
        state: tenantId,        // Pass tenantId securely in the OAuth state parameter
      });

      res.status(200).json({
        status: 'success',
        authUrl,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Handles Google OAuth callback redirect.
   * Trades the auth code for access/refresh tokens and stores them in the database.
   */
  public static async googleCallback(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { code, state: tenantId, error } = req.query;

      if (error) {
        res.status(400).send(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding-top: 100px; background-color: #f8fafc;">
              <h2 style="color: #ef4444;">OAuth Authentication Failed</h2>
              <p>${error}</p>
            </body>
          </html>
        `);
        return;
      }

      if (!code || !tenantId || typeof tenantId !== 'string' || !z.string().uuid().safeParse(tenantId).success) {
        res.status(400).send(`
          <html>
            <body style="font-family: Arial, sans-serif; text-align: center; padding-top: 100px; background-color: #f8fafc;">
              <h2 style="color: #ef4444;">Invalid Request</h2>
              <p>Missing auth code or invalid tenant session ID.</p>
            </body>
          </html>
        `);
        return;
      }

      if (code === 'mock-code') {
        const expiryDate = new Date(Date.now() + 365 * 24 * 3600 * 1000); // 1 year
        await prisma.googleCredential.upsert({
          where: { tenantId },
          update: {
            accessToken: 'mock-access-token',
            refreshToken: 'mock-refresh-token',
            expiryDate,
          },
          create: {
            tenantId,
            accessToken: 'mock-access-token',
            refreshToken: 'mock-refresh-token',
            expiryDate,
          },
        });
      } else {
        // Initialize OAuth2 client
        const oauth2Client = new google.auth.OAuth2(
          config.GOOGLE_CLIENT_ID,
          config.GOOGLE_CLIENT_SECRET,
          config.GOOGLE_REDIRECT_URI
        );

        // Exchange authorization code for tokens
        const { tokens } = await oauth2Client.getToken(code as string);

        if (!tokens.access_token) {
          throw new Error('Google did not return an access token.');
        }

        const expiryDate = tokens.expiry_date 
          ? new Date(tokens.expiry_date) 
          : new Date(Date.now() + 3600 * 1000);

        // Save tokens securely in Postgres (Rule of least privilege: tenantId matching isolation)
        await prisma.googleCredential.upsert({
          where: { tenantId },
          update: {
            accessToken: tokens.access_token,
            // Only update refresh token if Google returned it, otherwise preserve existing
            ...(tokens.refresh_token && { refreshToken: tokens.refresh_token }),
            expiryDate,
          },
          create: {
            tenantId,
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || '', // Handled if consent wasn't forced (though prompt: 'consent' forces it)
            expiryDate,
          },
        });
      }

      // Respond with a clean, beautifully styled page
      res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Google Calendar Connected</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
              background-color: #0f172a;
              color: #f8fafc;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
            }
            .card {
              background-color: #1e293b;
              padding: 40px;
              border-radius: 16px;
              box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3), 0 8px 10px -6px rgba(0,0,0,0.3);
              text-align: center;
              max-width: 400px;
              width: 90%;
            }
            .icon {
              font-size: 48px;
              margin-bottom: 20px;
            }
            h2 {
              margin-top: 0;
              color: #38bdf8;
              font-weight: 600;
            }
            p {
              color: #94a3b8;
              font-size: 16px;
              line-height: 1.5;
            }
            .btn {
              display: inline-block;
              margin-top: 24px;
              padding: 10px 20px;
              background-color: #0284c7;
              color: white;
              text-decoration: none;
              border-radius: 8px;
              font-weight: 500;
              transition: background-color 0.2s;
            }
            .btn:hover {
              background-color: #0369a1;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <div class="icon">📅</div>
            <h2>Calendar Connected!</h2>
            <p>Your Google Calendar has been successfully integrated with your Voice Agent account.</p>
            <p>You can now safely close this window and return to the dashboard.</p>
          </div>
        </body>
        </html>
      `);
    } catch (error: any) {
      console.error('[AuthController.googleCallback] Error during OAuth redirect handling:', error);
      res.status(500).send(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; padding-top: 100px; background-color: #f8fafc; color: #334155;">
            <h2 style="color: #ef4444;">Server Error</h2>
            <p>Failed to exchange Google OAuth authorization token: ${error.message || error}</p>
          </body>
        </html>
      `);
    }
  }
}
