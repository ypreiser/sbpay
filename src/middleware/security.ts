import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import express from "express";
type Express = express.Express;
type Response = express.Response;


export const configureSecurityMiddleware = (app: Express) => {
  // Rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later'
  });

  // Apply rate limiter to all routes
  app.use(limiter);

  // Security headers
  app.use(helmet());

  // Prevent common web vulnerabilities
  app.disable('x-powered-by');
}; 