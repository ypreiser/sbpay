import express from "express";
import paymentRoutes from "./routes/payment.routes.js";
import env from "./config/env.js";
import crypto from "crypto";
import { requestLogger } from "./utils/logger.js";
import logger from "./utils/logger.js";
import { configureSecurityMiddleware } from "./middleware/security.js";
import { startKeepAlive } from "./utils/keep-alive.js";

const app = express();

// Middleware
app.use(express.json());
app.use(requestLogger);
configureSecurityMiddleware(app);

// Routes
app.use("/api", paymentRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Test endpoint
app.post("/api/test", async (req, res) => {
  try {
    logger.info("Received test request", {
      headers: req.headers,
      query: req.query,
      body: req.body,
    });

    res.status(200).json({ message: "Received successfully", data: req.body });
  } catch (error) {
    console.error("Error processing test request:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
});


app.post("/api/test/sbpay", async (req, res) => {
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
      .createHmac("sha256", env.SBPAY_SECRET)
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
    logger.error("Test request failed:", error);
    res.status(500).json({ error: "Test request failed" });
  }
});

// Test webhook endpoint
app.post("/api/test/webhook", async (req, res) => {
  try {
    const testPayload = {
      order_id: `ORDER_${Date.now()}`,
      status: "completed",
      amount: 100,
      currency: "ILS",
    };

    logger.info("Creating test webhook request", { payload: testPayload });

    const signature = crypto
      .createHmac("sha256", env.SBPAY_SECRET)
      .update(JSON.stringify(testPayload))
      .digest("hex");

    const webhookUrl = `${req.protocol}://${req.get(
      "host"
    )}/api/webhook/payment`;
    logger.info("Sending test webhook", { url: webhookUrl });

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-SBPay-Signature": signature,
      },
      body: JSON.stringify(testPayload),
    });

    const result = await response.json();
    logger.info("Test webhook response", { result });
    res.json(result);
  } catch (error) {
    logger.error("Test webhook failed:", {
      error,
      stack: (error as Error).stack,
    });
    res.status(500).json({
      error: "Test webhook failed",
      details:
        process.env.NODE_ENV === "development"
          ? (error as Error).message
          : undefined,
    });
  }
});

// Error handling middleware
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    logger.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
);

const server = app.listen(env.PORT, () => {
  logger.info(`Server running on port ${env.PORT}`);

  if (env.NODE_ENV === "production") {
    startKeepAlive();
  }
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received. Shutting down gracefully...");
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
});

export default app;
