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
          <head>
            <title>Redirecting to Payment...</title>
            <style>
              body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
              button { padding: 15px 30px; font-size: 18px; cursor: pointer; }
            </style>
          </head>
          <body>
            <form id="yaadForm" action="https://icom.yaad.net/p/" method="get" target="_blank">
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
              <input type="hidden" name="successUrl" value="${env.APP_URL}/api/payment-success">
              <input type="hidden" name="cancelUrl" value="${env.APP_URL}/api/payment-cancelled">
              <input type="hidden" name="callback" value="${env.APP_URL}/api/yaad-callback">
            </form>
            <button onclick="document.getElementById('yaadForm').submit()">Click here to proceed to payment</button>
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

  async handleYaadWebhook(req: Request, res: Response): Promise<any> {
    try {
      logger.info("Yaad webhook received:", {
        query: req.query,
      });

      // Get all query parameters for verification
      const {
        Id,
        CCode,
        Amount,
        ACode,
        Order: orderId,
        Sign,
        Bank,
        Payments,
        UserId,
        Brand,
        Issuer,
        L4digit,
        Coin,
        Tmonth,
        Tyear,
        errMsg,
        Hesh,
      } = req.query;

      // Build verification URL
      const verifyParams = new URLSearchParams({
        action: "APISign",
        What: "VERIFY",
        KEY: env.YAAD_KEY,
        PassP: env.YAAD_PassP,
        Masof: env.YAAD_MASOF,
        ...(req.query as Record<string, string>), // Include all original parameters
      });

      const verifyUrl = `https://icom.yaad.net/p/?${verifyParams.toString()}`;
      logger.info("Verifying payment:", { verifyUrl });

      const verifyResponse = await fetch(verifyUrl);
      const verifyResult = await verifyResponse.text();

      if (CCode === "0" && verifyResult.includes("CCode=0")) {
        // Payment verified successfully
        logger.info("Payment verified successfully", { orderId, Amount });
        await this.sbPayService.approveOrder(orderId as string);
        return res.json({ status: "success" });
      } else {
        // Payment verification failed
        logger.error("Payment verification failed", {
          CCode,
          verifyResult,
          orderId,
        });
        return res.status(400).json({
          error: "Payment verification failed",
          code: CCode,
          message: errMsg,
        });
      }
    } catch (error) {
      logger.error("Yaad webhook processing failed:", {
        error,
        query: req.query,
        stack: (error as Error).stack,
      });
      return res.status(500).json({ error: "Webhook processing failed" });
    }
  }

  async showSuccessPage(req: Request, res: Response): Promise<any> {
    const successHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Payment Successful</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              text-align: center;
              padding: 50px;
              background-color: #f0f0f0;
            }
            .success-container {
              background: white;
              padding: 30px;
              border-radius: 10px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              max-width: 600px;
              margin: 0 auto;
            }
            .success-icon {
              color: #4CAF50;
              font-size: 48px;
              margin-bottom: 20px;
            }
            h1 { color: #4CAF50; }
            p { color: #666; }
            .order-id { 
              background: #f8f8f8;
              padding: 10px;
              border-radius: 5px;
              margin: 20px 0;
            }
          </style>
        </head>
        <body>
          <div class="success-container">
            <div class="success-icon">✓</div>
            <h1>Payment Successful!</h1>
            <p>Your payment has been processed successfully.</p>
            <div class="order-id">
              Order ID: ${req.query.Order || "N/A"}<br>
              Amount: ${req.query.Amount || "N/A"} ILS
            </div>
            <p>You can close this window now.</p>
          </div>
        </body>
      </html>
    `;
    res.send(successHtml);
  }

  async showCancelPage(req: Request, res: Response): Promise<any> {
    const cancelHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Payment Cancelled</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              text-align: center;
              padding: 50px;
              background-color: #f0f0f0;
            }
            .cancel-container {
              background: white;
              padding: 30px;
              border-radius: 10px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              max-width: 600px;
              margin: 0 auto;
            }
            .cancel-icon {
              color: #f44336;
              font-size: 48px;
              margin-bottom: 20px;
            }
            h1 { color: #f44336; }
            p { color: #666; }
            button {
              padding: 10px 20px;
              background: #4CAF50;
              color: white;
              border: none;
              border-radius: 5px;
              cursor: pointer;
            }
          </style>
        </head>
        <body>
          <div class="cancel-container">
            <div class="cancel-icon">✕</div>
            <h1>Payment Cancelled</h1>
            <p>Your payment was cancelled or not completed.</p>
            <p>You can close this window and try again.</p>
          </div>
        </body>
      </html>
    `;
    res.send(cancelHtml);
  }
}
