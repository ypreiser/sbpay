import { Request, Response, NextFunction } from 'express';

export const logger = {
  info: (message: string, meta?: any) => {
    console.log(new Date().toISOString(), 'INFO:', message, meta || '');
  },
  error: (message: string, error?: any) => {
    console.error(new Date().toISOString(), 'ERROR:', message, error || '');
  }
};

export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.url}`, {
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
    });
  });

  next();
}; 