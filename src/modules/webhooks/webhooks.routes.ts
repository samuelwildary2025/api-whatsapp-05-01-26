import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { prisma } from '../../lib/prisma.js';
import { waManager, WAEvent } from '../../lib/whatsapp.js';
import { instanceTokenMiddleware } from '../../middlewares/auth.js';
import { logger } from '../../lib/logger.js';
import { env } from '../../config/env.js';

const webhooks = new Hono();

// ================================
// Webhook Service
// ================================

interface WebhookPayload {
    event: string;
    instanceId: string;
    timestamp: string;
    data: any;
}

async function sendWebhook(url: string, payload: WebhookPayload): Promise<boolean> {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), env.webhookTimeout);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'WhatsApp-API-Webhook/1.0',
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
            logger.warn({ url, status: response.status }, 'Webhook returned non-2xx status');
            return false;
        }

        return true;
    } catch (error) {
        logger.error({ url, error }, 'Failed to send webhook');
        return false;
    }
}

async function sendWebhookWithRetry(url: string, payload: WebhookPayload): Promise<void> {
    for (let attempt = 1; attempt <= env.webhookRetryAttempts; attempt++) {
        const success = await sendWebhook(url, payload);
        if (success) return;

        if (attempt < env.webhookRetryAttempts) {
            // Exponential backoff: 1s, 2s, 4s, etc.
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
        }
    }
}

async function dispatchWebhook(instanceId: string, event: string, data: any): Promise<void> {
    const payload: WebhookPayload = {
        event,
        instanceId,
        timestamp: new Date().toISOString(),
        data,
    };

    logger.info({ instanceId, event }, 'Dispatching webhook');

    // Get instance webhook config
    const instance = await prisma.instance.findUnique({
        where: { id: instanceId },
        select: {
            webhookUrl: true,
            webhookEvents: true,
        },
    });

    logger.info({
        instanceId,
        webhookUrl: instance?.webhookUrl,
        webhookEvents: instance?.webhookEvents
    }, 'Instance webhook config');

    // Get global webhook config
    const globalSettings = await prisma.globalSettings.findUnique({
        where: { id: 'global' },
    });

    // Send to instance webhook if configured
    if (instance?.webhookUrl) {
        const events = instance.webhookEvents;
        if (events.length === 0 || events.includes(event) || events.includes('*')) {
            logger.info({ url: instance.webhookUrl, event }, 'Sending webhook to instance URL');
            sendWebhookWithRetry(instance.webhookUrl, payload);
        } else {
            logger.info({ event, configuredEvents: events }, 'Event not in configured events');
        }
    } else {
        logger.info({ instanceId }, 'No webhook URL configured for instance');
    }

    // Send to global webhook if configured
    if (globalSettings?.webhookUrl) {
        const events = globalSettings.webhookEvents;
        if (events.length === 0 || events.includes(event) || events.includes('*')) {
            sendWebhookWithRetry(globalSettings.webhookUrl, payload);
        }
    }
}

// ================================
// Setup Event Listeners
// ================================

export function setupWebhookListeners(): void {
    const events: WAEvent[] = [
        'qr',
        'ready',
        'authenticated',
        'auth_failure',
        'disconnected',
        'message',
        'message_create',
        'message_ack',
        'message_revoke_everyone',
        'group_join',
        'group_leave',
        'group_update',
        'call',
    ];

    for (const event of events) {
        waManager.on(event, (data) => {
            dispatchWebhook(data.instanceId, event, data);
        });
    }

    logger.info('Webhook listeners setup complete');
}

// ================================
// SSE Connections Store
// ================================

const sseConnections = new Map<string, Set<WritableStreamDefaultWriter>>();

export function broadcastSSE(instanceId: string, event: string, data: any): void {
    const connections = sseConnections.get(instanceId);
    if (!connections) return;

    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    const encoder = new TextEncoder();
    const chunk = encoder.encode(message);

    for (const writer of connections) {
        try {
            writer.write(chunk);
        } catch (error) {
            // Connection closed, will be cleaned up
        }
    }
}

// ================================
// Routes
// ================================

/**
 * GET /sse/:instanceId
 * Server-Sent Events stream for real-time updates
 */
webhooks.get('/sse/:instanceId', instanceTokenMiddleware, async (c) => {
    const instanceId = c.get('instanceId');

    return streamSSE(c, async (stream) => {
        // Send initial status
        const status = waManager.getStatus(instanceId);
        await stream.writeSSE({
            event: 'status',
            data: JSON.stringify({ status }),
        });

        // Setup event handlers
        const handlers = new Map<string, (data: any) => void>();

        const events: WAEvent[] = [
            'qr',
            'ready',
            'authenticated',
            'auth_failure',
            'disconnected',
            'message',
            'message_create',
            'message_ack',
            'message_revoke_everyone',
            'group_join',
            'group_leave',
            'group_update',
            'call',
        ];

        for (const event of events) {
            const handler = (data: any) => {
                if (data.instanceId === instanceId) {
                    stream.writeSSE({
                        event,
                        data: JSON.stringify(data),
                    });
                }
            };
            handlers.set(event, handler);
            waManager.on(event, handler);
        }

        // Keep connection alive
        const keepAlive = setInterval(() => {
            stream.writeSSE({
                event: 'ping',
                data: JSON.stringify({ timestamp: Date.now() }),
            });
        }, 30000);

        // Wait for close
        try {
            while (true) {
                await stream.sleep(60000);
            }
        } finally {
            // Cleanup
            clearInterval(keepAlive);
            for (const [event, handler] of handlers) {
                waManager.off(event, handler);
            }
        }
    });
});

/**
 * GET /webhook/events
 * List available webhook events
 */
webhooks.get('/events', async (c) => {
    const events = [
        { name: 'qr', description: 'QR code generated for connection' },
        { name: 'ready', description: 'WhatsApp connected and ready' },
        { name: 'authenticated', description: 'Authentication successful' },
        { name: 'auth_failure', description: 'Authentication failed' },
        { name: 'disconnected', description: 'WhatsApp disconnected' },
        { name: 'message', description: 'New message received' },
        { name: 'message_create', description: 'Message created (sent or received)' },
        { name: 'message_ack', description: 'Message acknowledgement (delivered, read)' },
        { name: 'message_revoke_everyone', description: 'Message deleted for everyone' },
        { name: 'group_join', description: 'Someone joined a group' },
        { name: 'group_leave', description: 'Someone left a group' },
        { name: 'group_update', description: 'Group settings updated' },
        { name: 'call', description: 'Incoming call' },
        { name: '*', description: 'All events (wildcard)' },
    ];

    return c.json({
        success: true,
        data: events,
    });
});

export { webhooks as webhooksRoutes };
