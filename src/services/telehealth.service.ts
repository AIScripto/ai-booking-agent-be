/**
 * Telehealth room provisioning.
 *
 * Rooms are created per appointment against the Daily.co REST API.
 *
 * There is deliberately **no fallback room**. A shared or fabricated URL puts two
 * unrelated patients into the same consultation, so every failure path throws
 * instead of returning a link. A caller that cannot start a video visit must show
 * that plainly — never hand out a room that is not this appointment's.
 */

export interface TelehealthRoom {
  roomId: string;
  roomUrl: string;
  provider: 'DAILY' | 'ZOOM' | 'GOOGLE_MEET';
  expiresAt: Date;
}

/** The subset of the Daily.co `POST /v1/rooms` response this service relies on. */
interface DailyRoomResponse {
  name?: string;
  url?: string;
  error?: string;
  info?: string;
}

/**
 * Raised when a room cannot be provisioned, for any reason.
 *
 * Carries a human-readable cause for the operator. It must never contain the API
 * key or any other credential — the message reaches an HTTP response.
 */
export class TelehealthUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TelehealthUnavailableError';
  }
}

/** Rooms outlive a consultation but not the day. */
const ROOM_TTL_MS = 2 * 3600 * 1000;

export class TelehealthService {
  /**
   * Read at call time, not at class-load. Capturing it in a static field freezes
   * whatever the environment held when the module was first imported, which makes
   * the service untestable and hides a late-loaded `.env`.
   */
  private static get dailyApiKey(): string | undefined {
    return process.env.DAILY_API_KEY;
  }

  /** True when a usable, non-placeholder Daily.co key is present. */
  private static isConfigured(): boolean {
    const key = this.dailyApiKey;
    return typeof key === 'string' && key.length > 0 && !key.startsWith('daily_api_key_');
  }

  /**
   * Provisions a video room dedicated to one appointment.
   *
   * @security The returned room is currently public to anyone holding the URL.
   *   Treat the URL as a credential until private rooms and per-participant
   *   meeting tokens are added.
   * @throws {TelehealthUnavailableError} when the provider is unsupported, the
   *   Daily.co key is absent or a placeholder, the API is unreachable, or the API
   *   declines to create the room. Never resolves with a substitute room.
   */
  public static async createVideoRoom(
    appointmentId: string,
    provider: 'DAILY' | 'ZOOM' | 'GOOGLE_MEET' = 'DAILY'
  ): Promise<TelehealthRoom> {
    if (provider !== 'DAILY') {
      // Previously these branches returned invented URLs (a random zoom.us/j/
      // number, a fixed meet.google.com code) that lead nowhere.
      throw new TelehealthUnavailableError(
        `${provider} rooms are not implemented. Only DAILY is supported.`
      );
    }

    if (!this.isConfigured()) {
      throw new TelehealthUnavailableError(
        'Telehealth is not configured: DAILY_API_KEY is missing or is a placeholder.'
      );
    }

    const expiresAt = new Date(Date.now() + ROOM_TTL_MS);
    const roomId = `room_${appointmentId.substring(0, 8)}_${Date.now()}`;

    let response: Response;
    try {
      response = await fetch('https://api.daily.co/v1/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.dailyApiKey}`,
        },
        body: JSON.stringify({
          name: roomId,
          properties: { exp: Math.floor(expiresAt.getTime() / 1000) },
        }),
      });
    } catch (error) {
      const cause = error instanceof Error ? error.message : 'unknown network error';
      console.error('[TelehealthService] Daily.co unreachable:', cause);
      throw new TelehealthUnavailableError(`Could not reach the video provider: ${cause}`);
    }

    const body: DailyRoomResponse | null = await response
      .json()
      .then((parsed) => parsed as DailyRoomResponse)
      .catch(() => null);

    if (!response.ok || !body || !body.url) {
      const detail = body?.error ?? body?.info ?? `HTTP ${response.status}`;
      console.error(`[TelehealthService] Daily.co declined room ${roomId}: ${detail}`);
      throw new TelehealthUnavailableError(`Video provider declined the room request: ${detail}`);
    }

    console.log(`[TelehealthService] Created Daily.co room ${body.name ?? roomId}`);

    return {
      roomId: body.name ?? roomId,
      roomUrl: body.url,
      provider: 'DAILY',
      expiresAt,
    };
  }
}
