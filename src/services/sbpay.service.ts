import crypto from 'crypto';
import env from '../config/env.ts';

export class SBPayService {
  private static instance: SBPayService;

  private constructor() {}

  public static getInstance(): SBPayService {
    if (!SBPayService.instance) {
      SBPayService.instance = new SBPayService();
    }
    return SBPayService.instance;
  }

  validateSignature(payload: Record<string, unknown>, signature: string): boolean {
    try {
      const { signature: _, ...payloadWithoutSignature } = payload;
      const dataToSign = JSON.stringify(payloadWithoutSignature);
      return crypto
        .createHmac("sha256", env.SBPAY_SECRET)
        .update(dataToSign)
        .digest("hex") === signature;
    } catch (error) {
      console.error("Signature validation failed:", error);
      return false;
    }
  }

  async approveOrder(orderId: string): Promise<any> {
    const endpoint = `/orders/${orderId}/approve`;
    const body = {};
    const bodyString = JSON.stringify(body);
    const signature = this.generateSignature(bodyString);

    const headers = {
      "Content-Type": "application/json",
      "X-Auth-Token": env.SBPAY_API_KEY,
      "X-Merchant": env.SBPAY_MERCHANT,
      "X-Signature": signature,
    };

    const response = await fetch(`${env.SBPAY_API_URL}${endpoint}`, {
      method: "POST",
      headers,
      body: bodyString,
    });

    if (!response.ok) {
      throw new Error(`Failed to approve order: ${response.statusText}`);
    }

    return response.json();
  }

  generateSignature(data: string): string {
    return crypto
      .createHmac("sha256", env.SBPAY_SECRET)
      .update(data)
      .digest("hex");
  }
} 