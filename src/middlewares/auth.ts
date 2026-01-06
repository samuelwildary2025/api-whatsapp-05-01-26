import { Context, Next } from 'hono';
import { HTTPException } from 'hono/http-exception';
import * as jose from 'jose';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';

export interface AuthPayload {
    userId: string;
    email: string;
    role: 'USER' | 'ADMIN';
}

// Extend Hono context
declare module 'hono' {
    interface ContextVariableMap {
        user: AuthPayload;
        instanceId: string;
    }
}

/**
 * Middleware for JWT authentication
 */
export async function authMiddleware(c: Context, next: Next) {
    const authHeader = c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new HTTPException(401, { message: 'Missing or invalid authorization header' });
    }

    const token = authHeader.substring(7);

    try {
        const secret = new TextEncoder().encode(env.jwtSecret);
        const { payload } = await jose.jwtVerify(token, secret);

        c.set('user', {
            userId: payload.userId as string,
            email: payload.email as string,
            role: payload.role as 'USER' | 'ADMIN',
        });

        await next();
    } catch (error) {
        throw new HTTPException(401, { message: 'Invalid or expired token' });
    }
}

/**
 * Middleware for admin-only routes
 */
export async function adminMiddleware(c: Context, next: Next) {
    const adminToken = c.req.header('X-Admin-Token');

    // Check admin token
    if (adminToken === env.adminToken) {
        c.set('user', {
            userId: 'admin',
            email: 'admin@system',
            role: 'ADMIN',
        });
        await next();
        return;
    }

    // Check JWT with admin role
    const user = c.get('user');
    if (!user || user.role !== 'ADMIN') {
        throw new HTTPException(403, { message: 'Admin access required' });
    }

    await next();
}

/**
 * Middleware for instance token authentication
 * Used for API calls that authenticate via instance token
 */
export async function instanceTokenMiddleware(c: Context, next: Next) {
    const token = c.req.header('X-Instance-Token') || c.req.query('token');

    if (!token) {
        throw new HTTPException(401, { message: 'Missing instance token' });
    }

    const instance = await prisma.instance.findUnique({
        where: { token },
        include: { user: true },
    });

    if (!instance) {
        throw new HTTPException(401, { message: 'Invalid instance token' });
    }

    c.set('user', {
        userId: instance.userId,
        email: instance.user.email,
        role: instance.user.role,
    });
    c.set('instanceId', instance.id);

    await next();
}

/**
 * Helper to generate JWT token
 */
export async function generateToken(payload: AuthPayload): Promise<string> {
    const secret = new TextEncoder().encode(env.jwtSecret);

    const token = await new jose.SignJWT({
        userId: payload.userId,
        email: payload.email,
        role: payload.role,
    })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(env.jwtExpiresIn)
        .sign(secret);

    return token;
}
