import fetch from 'node-fetch';
import { logger } from './logger.ts';

const PING_INTERVAL = 5 * 60 * 1000; // 5 minutes
const APP_URL = process.env.APP_URL || 'https://your-app.onrender.com';

export const startKeepAlive = () => {
  setInterval(async () => {
    try {
      const response = await fetch(`${APP_URL}/health`);
      if (!response.ok) {
        throw new Error(`Health check failed: ${response.status}`);
      }
      logger.info('Keep-alive ping successful');
    } catch (error) {
      logger.error('Keep-alive ping failed', error);
    }
  }, PING_INTERVAL);
}; 