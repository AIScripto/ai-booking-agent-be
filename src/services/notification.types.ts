/**
 * Outcome of a notification attempt.
 *
 * sent     - the provider accepted the message.
 * disabled - the channel is not configured (not live). Nothing was sent.
 * failed   - we tried and it did not work. Nothing was sent.
 *
 * `success` is true only for `sent`. A channel that is not live must never
 * report success, because callers and staff would believe a message went out.
 */
export type NotificationStatus = 'sent' | 'disabled' | 'failed';
