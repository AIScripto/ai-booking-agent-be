/**
 * Deadlines for outbound calls, in milliseconds.
 *
 * VOICE: a caller is waiting on the phone, so keep it short.
 * BACKGROUND: dashboard actions and work done after the reply has been sent.
 * NEXT_SLOT_SEARCH: total time allowed to look for the next free slot.
 */
export const TIMEOUTS = {
  VOICE_CALL_MS: 2500,
  BACKGROUND_CALL_MS: 8000,
  NEXT_SLOT_SEARCH_MS: 4000,
} as const;
