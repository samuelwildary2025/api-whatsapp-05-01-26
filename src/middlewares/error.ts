import { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import { logger } from '../lib/logger.js';

export function errorHandler(err: Error, c: Context) {
    logger.error({ err, path: c.req.path, method: c.req.method }, 'Request error');

    // Zod validation errors
    if (err instanceof ZodError) {
        return c.json(
            {
                success: false,
                error: 'Validation error',
                details: err.errors.map((e) => ({
                    field: e.path.join('.'),
                    message: e.message,
                })),
            },
            400
        );
    }

    // HTTP exceptions from Hono
    if (err instanceof HTTPException) {
        return c.json(
            {
                success: false,
                error: err.message,
            },
            err.status
        );
    }

    // Default error
    return c.json(
        {
            success: false,
            error: 'Internal server error',
        },
        500
    );
}
