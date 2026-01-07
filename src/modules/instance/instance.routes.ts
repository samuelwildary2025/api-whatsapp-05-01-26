import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { waManager } from '../../lib/whatsapp.js';
import { authMiddleware } from '../../middlewares/auth.js';
import { HTTPException } from 'hono/http-exception';

const instance = new Hono();

// ================================
// Schemas
// ================================

const updateNameSchema = z.object({
    name: z.string().min(1).max(100),
});

const updateSettingsSchema = z.object({
    alwaysOnline: z.boolean().optional(),
    ignoreGroups: z.boolean().optional(),
    rejectCalls: z.boolean().optional(),
    readMessages: z.boolean().optional(),
    syncFullHistory: z.boolean().optional(),
});

const updateProxySchema = z.object({
    proxyHost: z.string().nullable().optional(),
    proxyPort: z.string().nullable().optional(),
    proxyUsername: z.string().nullable().optional(),
    proxyPassword: z.string().nullable().optional(),
    proxyProtocol: z.enum(['http', 'https', 'socks4', 'socks5']).nullable().optional(),
});

// ================================
// Instance Connection Routes
// ================================

/**
 * POST /instance/:id/connect
 * Connect instance to WhatsApp (generates QR code)
 */
instance.post('/:id/connect', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');

    // Check instance exists and belongs to user
    const instanceData = await prisma.instance.findFirst({
        where: {
            id,
            OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
        },
    });

    if (!instanceData) {
        throw new HTTPException(404, { message: 'Instance not found' });
    }

    try {
        const waInstance = await waManager.connect(id);

        return c.json({
            success: true,
            data: {
                status: waInstance.status,
                qrCode: waInstance.qrCodeBase64,
                message: waInstance.status === 'connected'
                    ? 'Already connected'
                    : 'Scan the QR code with WhatsApp',
            },
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to connect'
        });
    }
});

/**
 * POST /instance/:id/connect-code
 * Connect instance using pairing code (alternative to QR)
 */
instance.post('/:id/connect-code', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');

    // Check instance exists and belongs to user
    const instanceData = await prisma.instance.findFirst({
        where: {
            id,
            OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
        },
    });

    if (!instanceData) {
        throw new HTTPException(404, { message: 'Instance not found' });
    }

    try {
        const body = await c.req.json();
        const phoneNumber = body.phoneNumber;

        if (!phoneNumber) {
            throw new HTTPException(400, { message: 'phoneNumber is required' });
        }

        const result = await waManager.connectWithPairingCode(id, phoneNumber);

        return c.json({
            success: true,
            data: {
                status: 'pairing',
                pairingCode: result.pairingCode,
                message: 'Enter this code in WhatsApp > Settings > Linked Devices > Link a Device',
            },
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to get pairing code'
        });
    }
});

/**
 * POST /instance/:id/disconnect
 * Disconnect instance (keeps session for reconnection)
 */
instance.post('/:id/disconnect', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');

    const instanceData = await prisma.instance.findFirst({
        where: {
            id,
            OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
        },
    });

    if (!instanceData) {
        throw new HTTPException(404, { message: 'Instance not found' });
    }

    try {
        await waManager.disconnect(id);

        return c.json({
            success: true,
            message: 'Instance disconnected successfully',
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to disconnect'
        });
    }
});

/**
 * POST /instance/:id/logout
 * Logout from WhatsApp (removes session)
 */
instance.post('/:id/logout', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');

    const instanceData = await prisma.instance.findFirst({
        where: {
            id,
            OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
        },
    });

    if (!instanceData) {
        throw new HTTPException(404, { message: 'Instance not found' });
    }

    try {
        await waManager.logout(id);

        return c.json({
            success: true,
            message: 'Logged out successfully',
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to logout'
        });
    }
});

/**
 * GET /instance/:id/status
 * Get instance connection status
 */
instance.get('/:id/status', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');

    const instanceData = await prisma.instance.findFirst({
        where: {
            id,
            OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
        },
    });

    if (!instanceData) {
        throw new HTTPException(404, { message: 'Instance not found' });
    }

    const status = waManager.getStatus(id);
    const qrData = waManager.getQRCode(id);

    return c.json({
        success: true,
        data: {
            id: instanceData.id,
            name: instanceData.name,
            status: status !== 'not_found' ? status : instanceData.status.toLowerCase(),
            waNumber: instanceData.waNumber,
            waName: instanceData.waName,
            qrCode: qrData.qrBase64,
        },
    });
});

/**
 * GET /instance/:id/qr
 * Get QR code for connection
 */
instance.get('/:id/qr', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');

    const instanceData = await prisma.instance.findFirst({
        where: {
            id,
            OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
        },
    });

    if (!instanceData) {
        throw new HTTPException(404, { message: 'Instance not found' });
    }

    const qrData = waManager.getQRCode(id);

    if (!qrData.qrBase64) {
        const status = waManager.getStatus(id);
        if (status === 'connected') {
            return c.json({
                success: true,
                data: {
                    status: 'connected',
                    message: 'Already connected, no QR code needed',
                },
            });
        }

        return c.json({
            success: false,
            error: 'QR code not available. Try connecting first.',
        }, 400);
    }

    return c.json({
        success: true,
        data: {
            qrCode: qrData.qrBase64,
        },
    });
});

/**
 * GET /instance/:id/qr/stream
 * Stream QR code updates via SSE
 */
instance.get('/:id/qr/stream', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');

    const instanceData = await prisma.instance.findFirst({
        where: {
            id,
            OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
        },
    });

    if (!instanceData) {
        throw new HTTPException(404, { message: 'Instance not found' });
    }

    return streamSSE(c, async (stream) => {
        let isConnected = false;

        const onQR = (data: { instanceId: string; qrBase64: string }) => {
            if (data.instanceId === id) {
                stream.writeSSE({
                    data: JSON.stringify({ type: 'qr', qrCode: data.qrBase64 }),
                    event: 'qr',
                });
            }
        };

        const onReady = (data: { instanceId: string }) => {
            if (data.instanceId === id) {
                isConnected = true;
                stream.writeSSE({
                    data: JSON.stringify({ type: 'connected' }),
                    event: 'connected',
                });
            }
        };

        const onDisconnected = (data: { instanceId: string }) => {
            if (data.instanceId === id) {
                stream.writeSSE({
                    data: JSON.stringify({ type: 'disconnected' }),
                    event: 'disconnected',
                });
            }
        };

        waManager.on('qr', onQR);
        waManager.on('ready', onReady);
        waManager.on('disconnected', onDisconnected);

        // Send initial status
        const currentStatus = waManager.getStatus(id);
        const qrData = waManager.getQRCode(id);

        stream.writeSSE({
            data: JSON.stringify({
                type: 'status',
                status: currentStatus,
                qrCode: qrData.qrBase64,
            }),
            event: 'status',
        });

        // Keep connection alive
        while (!isConnected) {
            await stream.sleep(30000); // Keep-alive every 30s
            stream.writeSSE({
                data: JSON.stringify({ type: 'ping' }),
                event: 'ping',
            });
        }

        // Cleanup
        waManager.off('qr', onQR);
        waManager.off('ready', onReady);
        waManager.off('disconnected', onDisconnected);
    });
});

/**
 * POST /instance/:id/name
 * Update instance name
 */
instance.post('/:id/name', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');
    const body = await c.req.json();
    const data = updateNameSchema.parse(body);

    const instanceData = await prisma.instance.findFirst({
        where: {
            id,
            OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
        },
    });

    if (!instanceData) {
        throw new HTTPException(404, { message: 'Instance not found' });
    }

    const updated = await prisma.instance.update({
        where: { id },
        data: { name: data.name },
    });

    return c.json({
        success: true,
        data: {
            id: updated.id,
            name: updated.name,
        },
    });
});

// ================================
// Instance Webhook Routes
// ================================

/**
 * GET /instance/:id/webhook
 * Get instance webhook configuration
 */
instance.get('/:id/webhook', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');

    const instanceData = await prisma.instance.findFirst({
        where: {
            id,
            OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
        },
        select: {
            id: true,
            webhookUrl: true,
            webhookEvents: true,
        },
    });

    if (!instanceData) {
        throw new HTTPException(404, { message: 'Instance not found' });
    }

    return c.json({
        success: true,
        data: instanceData,
    });
});

/**
 * POST /instance/:id/webhook
 * Configure instance webhook
 */
instance.post('/:id/webhook', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');
    const body = await c.req.json();

    const schema = z.object({
        webhookUrl: z.string().url().nullable(),
        webhookEvents: z.array(z.string()).optional(),
    });
    const data = schema.parse(body);

    const instanceData = await prisma.instance.findFirst({
        where: {
            id,
            OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
        },
    });

    if (!instanceData) {
        throw new HTTPException(404, { message: 'Instance not found' });
    }

    const updated = await prisma.instance.update({
        where: { id },
        data: {
            webhookUrl: data.webhookUrl,
            webhookEvents: data.webhookEvents || [],
        },
    });

    return c.json({
        success: true,
        data: {
            id: updated.id,
            webhookUrl: updated.webhookUrl,
            webhookEvents: updated.webhookEvents,
        },
    });
});

// ================================
// Instance Settings Routes
// ================================

/**
 * GET /instance/:id/settings
 * Get instance behavior settings
 */
instance.get('/:id/settings', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');

    const instanceData = await prisma.instance.findFirst({
        where: {
            id,
            OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
        },
        select: {
            id: true,
            alwaysOnline: true,
            ignoreGroups: true,
            rejectCalls: true,
            readMessages: true,
            syncFullHistory: true,
        },
    });

    if (!instanceData) {
        throw new HTTPException(404, { message: 'Instance not found' });
    }

    return c.json({
        success: true,
        data: instanceData,
    });
});

/**
 * PATCH /instance/:id/settings
 * Update instance behavior settings
 */
instance.patch('/:id/settings', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');

    try {
        const body = await c.req.json();
        const data = updateSettingsSchema.parse(body);

        const instanceData = await prisma.instance.findFirst({
            where: {
                id,
                OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
            },
        });

        if (!instanceData) {
            throw new HTTPException(404, { message: 'Instance not found' });
        }

        const updated = await prisma.instance.update({
            where: { id },
            data: {
                ...(data.alwaysOnline !== undefined && { alwaysOnline: data.alwaysOnline }),
                ...(data.ignoreGroups !== undefined && { ignoreGroups: data.ignoreGroups }),
                ...(data.rejectCalls !== undefined && { rejectCalls: data.rejectCalls }),
                ...(data.readMessages !== undefined && { readMessages: data.readMessages }),
                ...(data.syncFullHistory !== undefined && { syncFullHistory: data.syncFullHistory }),
            },
            select: {
                id: true,
                alwaysOnline: true,
                ignoreGroups: true,
                rejectCalls: true,
                readMessages: true,
                syncFullHistory: true,
            },
        });

        // Notify WhatsApp manager about settings change
        waManager.updateInstanceSettings(id, updated);

        return c.json({
            success: true,
            data: updated,
        });
    } catch (error: any) {
        console.error('Error updating settings:', error);
        return c.json({
            success: false,
            error: error.message || 'Failed to update settings',
        }, 500);
    }
});

// ================================
// Instance Proxy Routes
// ================================

/**
 * GET /instance/:id/proxy
 * Get instance proxy configuration
 */
instance.get('/:id/proxy', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');

    const instanceData = await prisma.instance.findFirst({
        where: {
            id,
            OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
        },
        select: {
            id: true,
            proxyHost: true,
            proxyPort: true,
            proxyUsername: true,
            proxyPassword: true,
            proxyProtocol: true,
        },
    });

    if (!instanceData) {
        throw new HTTPException(404, { message: 'Instance not found' });
    }

    return c.json({
        success: true,
        data: {
            id: instanceData.id,
            proxyHost: instanceData.proxyHost,
            proxyPort: instanceData.proxyPort,
            proxyUsername: instanceData.proxyUsername,
            // Don't expose password, just indicate if it's set
            proxyPasswordSet: !!instanceData.proxyPassword,
            proxyProtocol: instanceData.proxyProtocol,
        },
    });
});

/**
 * PATCH /instance/:id/proxy
 * Update instance proxy configuration
 */
instance.patch('/:id/proxy', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');

    try {
        const body = await c.req.json();
        const data = updateProxySchema.parse(body);

        const instanceData = await prisma.instance.findFirst({
            where: {
                id,
                OR: [{ userId: user.userId }, { user: { role: 'ADMIN' } }],
            },
        });

        if (!instanceData) {
            throw new HTTPException(404, { message: 'Instance not found' });
        }

        const updated = await prisma.instance.update({
            where: { id },
            data: {
                proxyHost: data.proxyHost,
                proxyPort: data.proxyPort,
                proxyUsername: data.proxyUsername,
                proxyPassword: data.proxyPassword,
                proxyProtocol: data.proxyProtocol,
            },
            select: {
                id: true,
                proxyHost: true,
                proxyPort: true,
                proxyUsername: true,
                proxyProtocol: true,
            },
        });

        // Forward proxy config to whatsmeow
        await waManager.setProxy(id, {
            proxyHost: data.proxyHost || '',
            proxyPort: data.proxyPort || '',
            proxyUsername: data.proxyUsername || '',
            proxyPassword: data.proxyPassword || '',
            proxyProtocol: data.proxyProtocol || 'socks5',
        });

        return c.json({
            success: true,
            data: updated,
        });
    } catch (error: any) {
        console.error('Error updating proxy:', error);
        return c.json({
            success: false,
            error: error.message || 'Failed to update proxy',
        }, 500);
    }
});

export { instance as instanceRoutes };
