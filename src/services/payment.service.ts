export interface PaymentIntentPayload {
  amountCents: number;
  currency?: string;
  customerEmail?: string;
  customerName?: string;
  description?: string;
}

/** Thrown when a payment cannot be started. Callers must show this, never pretend a payment exists. */
export class PaymentUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentUnavailableError';
  }
}

export class PaymentService {
  // Read at call time (not import time) so a change of environment is honoured and tests are repeatable.
  private static get stripeSecretKey(): string | undefined {
    return process.env.STRIPE_SECRET_KEY;
  }

  /**
   * Starts a Stripe PaymentIntent for a pre-appointment deposit.
   *
   * Payments are not live yet. This never returns a made-up PaymentIntent: it throws
   * PaymentUnavailableError so no customer is told a deposit exists when it does not.
   */
  public static async createPaymentIntent(_payload: PaymentIntentPayload): Promise<{
    clientSecret: string;
    paymentIntentId: string;
    status: string;
  }> {
    if (!this.stripeSecretKey || this.stripeSecretKey.startsWith('sk_test_51xxxx')) {
      throw new PaymentUnavailableError('Payments are not enabled.');
    }

    throw new PaymentUnavailableError('Live Stripe payments are not implemented.');
  }
}
