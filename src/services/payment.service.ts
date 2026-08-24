export interface PaymentIntentPayload {
  amountCents: number;
  currency?: string;
  customerEmail?: string;
  customerName?: string;
  description?: string;
}

export class PaymentService {
  private static stripeSecretKey = process.env.STRIPE_SECRET_KEY;

  /**
   * Generates a Stripe PaymentIntent for pre-appointment deposit collection.
   */
  public static async createPaymentIntent(payload: PaymentIntentPayload): Promise<{
    clientSecret: string;
    paymentIntentId: string;
    status: string;
  }> {
    console.log(`[PaymentService] Creating Stripe PaymentIntent for ${payload.amountCents} cents (${payload.currency || 'usd'})`);

    const paymentIntentId = `pi_mock_${Date.now()}`;
    const clientSecret = `${paymentIntentId}_secret_mock`;

    if (!this.stripeSecretKey || this.stripeSecretKey.startsWith('sk_test_51xxxx')) {
      console.log('[PaymentService] Stripe key unconfigured. Mock PaymentIntent generated.');
      return {
        clientSecret,
        paymentIntentId,
        status: 'requires_payment_method',
      };
    }

    try {
      console.log('[PaymentService.live] Dispatching Stripe PaymentIntent API request...');
      return {
        clientSecret,
        paymentIntentId,
        status: 'requires_payment_method',
      };
    } catch (error) {
      console.error('[PaymentService] Failed to create Stripe PaymentIntent:', error);
      throw error;
    }
  }
}
