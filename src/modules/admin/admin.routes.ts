import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { waManager } from '../../lib/whatsapp.js';
import { adminMiddleware, authMiddleware } from '../../middlewares/auth.js';
import { HTTPException } from 'hono/http-exception';
import { env } from '../../config/env.js';

const admin = new Hono();

// All admin routes require authentication
admin.use('*', authMiddleware);
admin.use('*', adminMiddleware);

// ================================
// Schemas
// ================================

const createInstanceSchema = z.object({
    name: z.string().min(1).max(100),
    userId: z.string().uuid().optional(), // If not provided, uses current user
    webhookUrl: z.string().url().optional(),
    webhookEvents: z.array(z.string()).optional(),
    // Proxy
    proxyHost: z.string().optional(),
    proxyPort: z.string().optional(),
    proxyUsername: z.string().optional(),
    proxyPassword: z.string().optional(),
    proxyProtocol: z.enum(['http', 'https', 'socks4', 'socks5']).default('http').optional(),
});

const updateInstanceSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    webhookUrl: z.string().url().nullable().optional(),
    webhookEvents: z.array(z.string()).optional(),
});

const globalWebhookSchema = z.object({
    webhookUrl: z.string().url().nullable(),
    webhookEvents: z.array(z.string()).optional(),
});

// ================================
// Instance Management
// ================================

/**
 * POST /admin/instance
 * Create a new WhatsApp instance
 */
admin.post('/instance', async (c) => {
    const body = await c.req.json();
    const data = createInstanceSchema.parse(body);
    const user = c.get('user');

    // Check instance limit
    const instanceCount = await prisma.instance.count();
    if (instanceCount >= env.waMaxInstances) {
        throw new HTTPException(400, {
            message: `Maximum number of instances (${env.waMaxInstances}) reached`
        });
    }

    const instance = await prisma.instance.create({
        data: {
            name: data.name,
            userId: data.userId || user.userId,
            webhookUrl: data.webhookUrl,
            webhookEvents: data.webhookEvents || [],
            proxyHost: data.proxyHost,
            proxyPort: data.proxyPort,
            proxyUsername: data.proxyUsername,
            proxyPassword: data.proxyPassword,
            proxyProtocol: data.proxyProtocol,
        },
    });

    return c.json({
        success: true,
        data: {
            id: instance.id,
            name: instance.name,
            token: instance.token,
            status: instance.status,
            webhookUrl: instance.webhookUrl,
            webhookEvents: instance.webhookEvents,
            createdAt: instance.createdAt,
        },
    });
});

/**
 * GET /admin/instances
 * List all instances
 */
admin.get('/instances', async (c) => {
    const instances = await prisma.instance.findMany({
        include: {
            user: {
                select: {
                    id: true,
                    email: true,
                    name: true,
                },
            },
            _count: {
                select: { campaigns: true },
            },
        },
        orderBy: { createdAt: 'desc' },
    });

    // Get live status from manager
    const instancesWithLiveStatus = instances.map((instance) => {
        const liveStatus = waManager.getStatus(instance.id);
        const qrData = waManager.getQRCode(instance.id);

        return {
            id: instance.id,
            name: instance.name,
            token: instance.token,
            status: liveStatus !== 'not_found' ? liveStatus : instance.status.toLowerCase(),
            waNumber: instance.waNumber,
            waName: instance.waName,
            webhookUrl: instance.webhookUrl,
            webhookEvents: instance.webhookEvents,
            user: instance.user,
            campaignsCount: instance._count.campaigns,
            qrCode: qrData.qrBase64,
            createdAt: instance.createdAt,
            updatedAt: instance.updatedAt,
        };
    });

    return c.json({
        success: true,
        data: instancesWithLiveStatus,
    });
});

/**
 * GET /admin/instance/:id
 * Get instance details
 */
admin.get('/instance/:id', async (c) => {
    const { id } = c.req.param();

    const instance = await prisma.instance.findUnique({
        where: { id },
        include: {
            user: {
                select: {
                    id: true,
                    email: true,
                    name: true,
                },
            },
        },
    });

    if (!instance) {
        throw new HTTPException(404, { message: 'Instance not found' });
    }

    const liveStatus = waManager.getStatus(id);
    const qrData = waManager.getQRCode(id);

    return c.json({
        success: true,
        data: {
            id: instance.id,
            name: instance.name,
            token: instance.token,
            status: liveStatus !== 'not_found' ? liveStatus : instance.status.toLowerCase(),
            waNumber: instance.waNumber,
            waName: instance.waName,
            waPicture: instance.waPicture,
            webhookUrl: instance.webhookUrl,
            webhookEvents: instance.webhookEvents,
            user: instance.user,
            qrCode: qrData.qrBase64,
            createdAt: instance.createdAt,
            updatedAt: instance.updatedAt,
        },
    });
});

/**
 * POST /admin/instance/:id/update
 * Update instance administrative fields
 */
admin.post('/instance/:id/update', async (c) => {
    const { id } = c.req.param();
    const body = await c.req.json();
    const data = updateInstanceSchema.parse(body);

    const instance = await prisma.instance.update({
        where: { id },
        data: {
            name: data.name,
            webhookUrl: data.webhookUrl,
            webhookEvents: data.webhookEvents,
        },
    });

    return c.json({
        success: true,
        data: {
            id: instance.id,
            name: instance.name,
            webhookUrl: instance.webhookUrl,
            webhookEvents: instance.webhookEvents,
            updatedAt: instance.updatedAt,
        },
    });
});

/**
 * DELETE /admin/instance/:id
 * Delete an instance
 */
admin.delete('/instance/:id', async (c) => {
    const { id } = c.req.param();

    // Disconnect and cleanup WhatsApp session
    try {
        await waManager.deleteInstance(id);
    } catch (error) {
        // Ignore errors, instance might not be connected
    }

    // Delete from database
    await prisma.instance.delete({
        where: { id },
    });

    return c.json({
        success: true,
        message: 'Instance deleted successfully',
    });
});

// ================================
// Global Webhook
// ================================

/**
 * GET /admin/webhook
 * Get global webhook configuration
 */
admin.get('/webhook', async (c) => {
    let settings = await prisma.globalSettings.findUnique({
        where: { id: 'global' },
    });

    if (!settings) {
        settings = await prisma.globalSettings.create({
            data: { id: 'global' },
        });
    }

    return c.json({
        success: true,
        data: {
            webhookUrl: settings.webhookUrl,
            webhookEvents: settings.webhookEvents,
            maxInstances: settings.maxInstances,
        },
    });
});

/**
 * POST /admin/webhook
 * Configure global webhook
 */
admin.post('/webhook', async (c) => {
    const body = await c.req.json();
    const data = globalWebhookSchema.parse(body);

    const settings = await prisma.globalSettings.upsert({
        where: { id: 'global' },
        update: {
            webhookUrl: data.webhookUrl,
            webhookEvents: data.webhookEvents || [],
        },
        create: {
            id: 'global',
            webhookUrl: data.webhookUrl,
            webhookEvents: data.webhookEvents || [],
        },
    });

    return c.json({
        success: true,
        data: {
            webhookUrl: settings.webhookUrl,
            webhookEvents: settings.webhookEvents,
        },
    });
});

// ================================
// Stats
// ================================

/**
 * GET /admin/stats
 * Get system statistics
 */
admin.get('/stats', async (c) => {
    const [
        totalUsers,
        totalInstances,
        connectedInstances,
        totalCampaigns,
        totalMessages,
    ] = await Promise.all([
        prisma.user.count(),
        prisma.instance.count(),
        prisma.instance.count({ where: { status: 'CONNECTED' } }),
        prisma.campaign.count(),
        prisma.message.count(),
    ]);

    const activeInstances = waManager.getAllInstances().length;

    return c.json({
        success: true,
        data: {
            users: totalUsers,
            instances: {
                total: totalInstances,
                connected: connectedInstances,
                active: activeInstances,
                limit: env.waMaxInstances,
            },
            campaigns: totalCampaigns,
            messages: totalMessages,
        },
    });
});

export { admin as adminRoutes };
