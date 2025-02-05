import express from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import crypto from "crypto";

const app = express();
app.use(express.json());

// Validation schemas and helper functions remain the same
const sbPayRequestSchema = z.object({
  transaction_id: z.string(),
  amount: z.number().or(z.string().transform((val) => parseFloat(val))),
  currency: z.string().default("ILS"),
  customer: z.object({
    name: z.string(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
  }),
  metadata: z.record(z.unknown()).optional(),
  signature: z.string(),
});

function validateSBPaySignature(
  payload: Record<string, unknown>,
  signature: string
): boolean {
  try {
    const { signature: _, ...payloadWithoutSignature } = payload;
    const dataToSign = JSON.stringify(payloadWithoutSignature);
    return (
      crypto
        .createHmac("sha256", process.env.SBPAY_SECRET!)
        .update(dataToSign)
        .digest("hex") === signature
    );
  } catch (error) {
    console.error("Signature validation failed:", error);
    return false;
  }
}

// Add these constants at the top with other imports
const SBPAY_API_URL = process.env.SBPAY_API_URL || "https://app.sbpay.me/api";
const SBPAY_API_KEY = process.env.SBPAY_API_KEY;
const SBPAY_MERCHANT = process.env.SBPAY_MERCHANT;

// Add this helper function near other helper functions
function generateSBPayHmacSignature(
  body: string,
  algo: string = "sha256"
): string {
  return crypto
    .createHmac(algo, process.env.SBPAY_SECRET!)
    .update(body)
    .digest("hex");
}

// Add this function to handle order approval
async function approveSBPayOrder(orderId: string) {
  const endpoint = `/orders/${orderId}/approve`;
  const body = {};
  const bodyString = JSON.stringify(body);
  const signature = generateSBPayHmacSignature(bodyString);

  const headers = {
    "Content-Type": "application/json",
    "X-Auth-Token": SBPAY_API_KEY,
    "X-Merchant": SBPAY_MERCHANT,
    "X-Signature": signature,
  };

  const response = await fetch(`${SBPAY_API_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": headers["Content-Type"],
      "X-Auth-Token": headers["X-Auth-Token"] || "",
      "X-Merchant": headers["X-Merchant"] || "",
      "X-Signature": headers["X-Signature"],
    },
    body: bodyString,
  });

  if (!response.ok) {
    throw new Error(`Failed to approve order: ${response.statusText}`);
  }

  return response.json();
}

// Main payment endpoint
app.post("/api/payment", async (req: Request, res: Response): Promise<any> => {
  try {
    const sbPaySignature = req.headers["x-sbpay-signature"];
    if (!sbPaySignature) {
      return res.status(401).json({ error: "Missing SBPay signature" });
    }

    if (!validateSBPaySignature(req.body, sbPaySignature as string)) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    const paymentData = sbPayRequestSchema.parse(req.body);

    // Get Yaad signature
    const signatureUrl = `https://icom.yaad.net/p/?${new URLSearchParams({
      action: "APISign",
      What: "SIGN",
      KEY: process.env.YAAD_KEY!,
      PassP: process.env.YAAD_PassP!,
      Masof: process.env.YAAD_Masof!,
      Order: paymentData.transaction_id,
      Amount: paymentData.amount.toString(),
      ClientName: paymentData.customer.name,
      Currency: "1",
      tmp: "1",
    })}`;

    const signResponse = await fetch(signatureUrl);
    const YaadResponseWithSignature = await signResponse.text();
    

    // Create final payment URL
    const finalPaymentUrl = `https://icom.yaad.net/p/?action=pay&${YaadResponseWithSignature}`;
    console.log({finalPaymentUrl});

    // Return or redirect based on environment
    if (process.env.NODE_ENV === "production") {
      return res.redirect(finalPaymentUrl);
    }

    return res.json({
      status: "success",
      payment_url: finalPaymentUrl,
      transaction_id: paymentData.transaction_id,
      debug: { signatureUrl, signature: YaadResponseWithSignature, finalPaymentUrl },
    });
  } catch (error) {
    console.error("Payment processing failed:", error);
    return res.status(500).json({ error: "Payment processing failed" });
  }
});

// Test endpoint
app.post("/api/test/sbpay", async (req: Request, res: Response) => {
  try {
    const sbPayRequest = {
      transaction_id: `SBPAY_${Date.now()}`,
      amount: req.body.custom_amount || 100.0,
      currency: "ILS",
      customer: {
        name: "Test Customer",
        email: "test@example.com",
        phone: "0501234567",
      },
    };

    const signature = crypto
      .createHmac("sha256", process.env.SBPAY_SECRET!)
      .update(JSON.stringify(sbPayRequest))
      .digest("hex");

    const response = await fetch(
      `${req.protocol}://${req.get("host")}/api/payment`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-SBPay-Signature": signature,
        },
        body: JSON.stringify({ ...sbPayRequest, signature }),
      }
    );

    const result = await response.json();
    res.json(result);
  } catch (error) {
    console.error("Test request failed:", error);
    res.status(500).json({ error: "Test request failed" });
  }
});

// Add webhook endpoint to handle successful payments
app.post(
  "/api/webhook/payment",
  async (req: Request, res: Response): Promise<any> => {
    try {
      const signature = req.headers["x-sbpay-signature"];
      if (!signature) {
        return res.status(401).json({ error: "Missing signature" });
      }

      if (!validateSBPaySignature(req.body, signature as string)) {
        return res.status(401).json({ error: "Invalid signature" });
      }

      const { order_id, status } = req.body;

      if (status === "completed") {
        await approveSBPayOrder(order_id);
        return res.json({ status: "success" });
      }

      return res.json({ status: "ignored" });
    } catch (error) {
      console.error("Webhook processing failed:", error);
      return res.status(500).json({ error: "Webhook processing failed" });
    }
  }
);

// const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });
