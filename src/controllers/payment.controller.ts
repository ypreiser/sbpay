import type { Request, Response } from "express";
import { sbPayRequestSchema } from "../types/sbpay.js";
import { SBPayService } from "../services/sbpay.service.js";
import { YaadPayService } from "../services/yaadpay.service.js";
import env from "../config/env.js";
import logger from "../utils/logger.js";

export class PaymentController {
  private sbPayService = SBPayService.getInstance();
  private yaadPayService = YaadPayService.getInstance();

  async processPayment(req: Request, res: Response): Promise<any> {
    try {
      const sbPaySignature = req.headers["x-sbpay-signature"];
      if (!sbPaySignature) {
        return res.status(401).json({ error: "Missing SBPay signature" });
      }

      if (
        !this.sbPayService.validateSignature(req.body, sbPaySignature as string)
      ) {
        return res.status(401).json({ error: "Invalid signature" });
      }

      const paymentData = sbPayRequestSchema.parse(req.body);

      // Generate Yaad payment form
      const formHtml = `
        <!DOCTYPE html>
        <html>
          <head><title>Redirecting to Payment...</title></head>
          <body>
            <form id="yaadForm" action="https://icom.yaad.net/p/" method="get">
              <input type="hidden" name="action" value="APISign">
              <input type="hidden" name="What" value="SIGN">
              <input type="hidden" name="KEY" value="${env.YAAD_KEY}">
              <input type="hidden" name="PassP" value="${env.YAAD_PassP}">
              <input type="hidden" name="Masof" value="${env.YAAD_MASOF}">
              <input type="hidden" name="Order" value="${paymentData.transaction_id}">
              <input type="hidden" name="Amount" value="${paymentData.amount}">
              <input type="hidden" name="ClientName" value="${paymentData.customer.name}">
              <input type="hidden" name="Currency" value="1">
              <input type="hidden" name="tmp" value="1">
            </form>
            <script>document.getElementById('yaadForm').submit();</script>
          </body>
        </html>
      `;

      // In development, return both form and direct URL
      if (env.NODE_ENV === "development") {
        const yaadUrl = await this.yaadPayService.getPaymentUrl(
          paymentData.transaction_id,
          paymentData.amount,
          paymentData.customer.name
        );

        return res.json({
          status: "success",
          payment_url: yaadUrl,
          payment_form: formHtml,
          transaction_id: paymentData.transaction_id,
        });
      }

      // In production, send the form directly
      res.send(formHtml);
    } catch (error) {
      logger.error("Payment processing failed:", error);
      return res.status(500).json({ error: "Payment processing failed" });
    }
  }

  async handleWebhook(req: Request, res: Response): Promise<any> {
    try {
      logger.info("Webhook received:", {
        headers: req.headers,
        body: req.body,
        query: req.query,
      });

      if (env.NODE_ENV === "development") {
        logger.info("Skipping signature validation in development mode");
      } else {
        const signature =
          req.headers["x-sbpay-signature"] || req.query.signature;
        if (!signature) {
          logger.error("Missing signature in webhook request", {
            headers: req.headers,
            body: req.body,
          });
          return res.status(401).json({
            error: "Missing signature",
            help: "Please ensure X-SBPay-Signature header or signature query parameter is provided",
          });
        }

        if (
          !this.sbPayService.validateSignature(req.body, signature as string)
        ) {
          logger.error("Invalid signature in webhook request", {
            receivedSignature: signature,
            payload: req.body,
          });
          return res.status(401).json({ error: "Invalid signature" });
        }
      }

      const { order_id, status } = req.body;
      logger.info("Processing webhook:", { order_id, status });

      if (status === "completed") {
        await this.sbPayService.approveOrder(order_id);
        return res.json({ status: "success" });
      }

      return res.json({ status: "ignored" });
    } catch (error) {
      logger.error("Webhook processing failed:", {
        error,
        stack: (error as Error).stack,
        body: req.body,
        headers: req.headers,
      });
      return res.status(500).json({
        error: "Webhook processing failed",
        details:
          process.env.NODE_ENV === "development"
            ? (error as Error).message
            : undefined,
      });
    }
  }
}
