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

/**
 * Prisma interactive transactions wait 2 s to start and 5 s to finish by default. Starting can
 * include opening a database connection, so allow more room. The work inside is a lock and a
 * couple of small queries, so it stays far below these limits when the database is healthy.
 */
export const TRANSACTION_OPTIONS = { maxWait: 5000, timeout: 10000 } as const;
