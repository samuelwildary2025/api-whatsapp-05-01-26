import { Hono } from 'hono';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../../lib/prisma.js';
import { generateToken } from '../../middlewares/auth.js';
import { HTTPException } from 'hono/http-exception';

const auth = new Hono();

// ================================
// Schemas
// ================================

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
});

// ================================
// Routes
// ================================

/**
 * POST /auth/login
 * Login and get JWT token
 */
auth.post('/login', async (c) => {
    const body = await c.req.json();
    const data = loginSchema.parse(body);

    // Check for Env Admin Login
    if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
        if (data.email === process.env.ADMIN_EMAIL && data.password === process.env.ADMIN_PASSWORD) {
            // Check if admin user exists in DB, if not create it
            let adminUser = await prisma.user.findUnique({
                where: { email: process.env.ADMIN_EMAIL }
            });

            if (!adminUser) {
                const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
                adminUser = await prisma.user.create({
                    data: {
                        email: process.env.ADMIN_EMAIL,
                        password: hashedPassword,
                        name: 'Admin System',
                        role: 'ADMIN',
                    }
                });
            }

            const token = await generateToken({
                userId: adminUser.id,
                email: adminUser.email,
                role: adminUser.role,
            });

            return c.json({
                success: true,
                data: {
                    user: {
                        id: adminUser.id,
                        email: adminUser.email,
                        name: adminUser.name,
                        role: adminUser.role,
                    },
                    token,
                },
            });
        }
    }

    throw new HTTPException(401, { message: 'Invalid credentials' });
});

/**
 * GET /auth/me
 * Get current user info (requires auth)
 */
auth.get('/me', async (c) => {
    const user = c.get('user');

    if (!user) {
        throw new HTTPException(401, { message: 'Not authenticated' });
    }

    const userData = await prisma.user.findUnique({
        where: { id: user.userId },
        select: {
            id: true,
            email: true,
            name: true,
            role: true,
            createdAt: true,
            _count: {
                select: { instances: true },
            },
        },
    });

    if (!userData) {
        throw new HTTPException(404, { message: 'User not found' });
    }

    return c.json({
        success: true,
        data: {
            ...userData,
            instancesCount: userData._count.instances,
        },
    });
});

export { auth as authRoutes };
