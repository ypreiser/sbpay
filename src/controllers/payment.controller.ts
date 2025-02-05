import type { Request, Response } from 'express';
import { sbPayRequestSchema } from '../types/sbpay.js';
import { SBPayService } from '../services/sbpay.service.js';
import { YaadPayService } from '../services/yaadpay.service.js';
import env from '../config/env.js';

export class PaymentController {
  private sbPayService = SBPayService.getInstance();
  private yaadPayService = YaadPayService.getInstance();

  async processPayment(req: Request, res: Response): Promise<any> {
    try {
      const sbPaySignature = req.headers["x-sbpay-signature"];
      if (!sbPaySignature) {
        return res.status(401).json({ error: "Missing SBPay signature" });
      }

      if (!this.sbPayService.validateSignature(req.body, sbPaySignature as string)) {
        return res.status(401).json({ error: "Invalid signature" });
      }

      const paymentData = sbPayRequestSchema.parse(req.body);
      const finalPaymentUrl = await this.yaadPayService.getPaymentUrl(
        paymentData.transaction_id,
        paymentData.amount,
        paymentData.customer.name
      );

      if (env.NODE_ENV === "production") {
        return res.redirect(finalPaymentUrl);
      }

      return res.json({
        status: "success",
        payment_url: finalPaymentUrl,
        transaction_id: paymentData.transaction_id,
      });
    } catch (error) {
      console.error("Payment processing failed:", error);
      return res.status(500).json({ error: "Payment processing failed" });
    }
  }

  async handleWebhook(req: Request, res: Response): Promise<any> {
    try {
      const signature = req.headers["x-sbpay-signature"];
      if (!signature) {
        return res.status(401).json({ error: "Missing signature" });
      }

      if (!this.sbPayService.validateSignature(req.body, signature as string)) {
        return res.status(401).json({ error: "Invalid signature" });
      }

      const { order_id, status } = req.body;

      if (status === "completed") {
        await this.sbPayService.approveOrder(order_id);
        return res.json({ status: "success" });
      }

      return res.json({ status: "ignored" });
    } catch (error) {
      console.error("Webhook processing failed:", error);
      return res.status(500).json({ error: "Webhook processing failed" });
    }
  }
} 