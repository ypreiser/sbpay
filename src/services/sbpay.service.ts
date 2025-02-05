import crypto from 'crypto';
import env from '../config/env.js';
import logger from '../utils/logger.js';

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

    const url = `${env.SBPAY_API_URL}${endpoint}`;
    logger.info("Approving order:", { 
      url,
      orderId,
      headers: {
        ...headers,
        "X-Auth-Token": "REDACTED"  // Don't log sensitive data
      },
      body: bodyString 
    });

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: bodyString,
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error("Order approval failed:", {
          status: response.status,
          statusText: response.statusText,
          errorText,
          orderId
        });
        throw new Error(`Failed to approve order: ${response.statusText}. Details: ${errorText}`);
      }

      const result = await response.json();
      logger.info("Order approved successfully:", { orderId, result });
      return result;
    } catch (error) {
      logger.error("Order approval error:", {
        error,
        stack: (error as Error).stack,
        orderId
      });
      throw error;
    }
  }

  generateSignature(data: string): string {
    return crypto
      .createHmac("sha256", env.SBPAY_SECRET)
      .update(data)
      .digest("hex");
  }
} 