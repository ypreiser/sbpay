import express from 'express';
import paymentRoutes from './routes/payment.routes.js';
import env from './config/env.js';
import crypto from 'crypto';
import { requestLogger, logger } from './utils/logger.js';
import { configureSecurityMiddleware } from './middleware/security.js';
import { startKeepAlive } from './utils/keep-alive.js';

const app = express();

// Middleware
app.use(express.json());
app.use(requestLogger);
configureSecurityMiddleware(app);

// Routes
app.use('/api', paymentRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Test endpoint
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

// Error handling middleware
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(env.PORT, () => {
  logger.info(`Server running on port ${env.PORT}`);
  
  if (env.NODE_ENV === 'production') {
    startKeepAlive();
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

export default app; 