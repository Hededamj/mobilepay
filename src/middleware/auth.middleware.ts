import { Request, Response, NextFunction } from 'express';
import { ApiError } from './error.middleware';

/**
 * Simple API key authentication middleware
 * For production, consider using JWT tokens
 */
export const authenticateApiKey = (req: Request, res: Response, next: NextFunction): void => {
  const apiKey = req.headers['x-api-key'] as string;
  const validApiKey = process.env.FAMILYMIND_API_KEY;

  if (!validApiKey) {
    // If no API key is configured, allow all requests (development mode)
    return next();
  }

  if (!apiKey || apiKey !== validApiKey) {
    const error: ApiError = new Error('Unauthorized - Invalid API key');
    error.statusCode = 401;
    return next(error);
  }

  next();
};

/**
 * Admin authentication middleware (stricter)
 */
export const authenticateAdmin = (req: Request, res: Response, next: NextFunction): void => {
  const apiKey = req.headers['x-api-key'] as string;
  const adminApiKey = process.env.JWT_SECRET; // Using JWT_SECRET as admin key for now

  if (!adminApiKey) {
    const error: ApiError = new Error('Admin authentication not configured');
    error.statusCode = 500;
    return next(error);
  }

  if (!apiKey || apiKey !== adminApiKey) {
    const error: ApiError = new Error('Unauthorized - Admin access required');
    error.statusCode = 401;
    return next(error);
  }

  next();
};
