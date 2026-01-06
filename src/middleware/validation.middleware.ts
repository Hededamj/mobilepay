import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { ApiError } from './error.middleware';

/**
 * Validate request body against Joi schema
 */
export const validateBody = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const validationError: ApiError = new Error('Validation failed');
      validationError.statusCode = 400;
      validationError.details = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));
      return next(validationError);
    }

    req.body = value;
    next();
  };
};

/**
 * Validate request params against Joi schema
 */
export const validateParams = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.params, {
      abortEarly: false,
    });

    if (error) {
      const validationError: ApiError = new Error('Validation failed');
      validationError.statusCode = 400;
      validationError.details = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));
      return next(validationError);
    }

    req.params = value;
    next();
  };
};

/**
 * Validate request query against Joi schema
 */
export const validateQuery = (schema: Joi.ObjectSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req.query, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const validationError: ApiError = new Error('Validation failed');
      validationError.statusCode = 400;
      validationError.details = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));
      return next(validationError);
    }

    req.query = value;
    next();
  };
};

// Common validation schemas
export const schemas = {
  // UUID validation
  uuid: Joi.string().uuid().required(),

  // Create agreement validation
  createAgreement: Joi.object({
    customer: Joi.object({
      email: Joi.string().email().required(),
      phone: Joi.string()
        .pattern(/^\+45\d{8}$/)
        .required()
        .messages({
          'string.pattern.base': 'Phone must be a valid Danish number (+45XXXXXXXX)',
        }),
      name: Joi.string().min(2).max(255).required(),
      stripeCustomerId: Joi.string().optional(),
    }).required(),
    plan: Joi.object({
      type: Joi.string().valid('monthly', 'semi_annual', 'annual').required(),
      amount: Joi.number().positive().required(),
      currency: Joi.string().valid('DKK').default('DKK'),
    }).required(),
  }),

  // Cancel agreement validation
  cancelAgreement: Joi.object({
    reason: Joi.string().max(500).optional(),
  }),
};
