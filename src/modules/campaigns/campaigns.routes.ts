import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { waManager } from '../../lib/whatsapp.js';
import { redis } from '../../lib/redis.js';
import { authMiddleware } from '../../middlewares/auth.js';
import { HTTPException } from 'hono/http-exception';
import { Queue, Worker, Job } from 'bullmq';
import { logger } from '../../lib/logger.js';

const campaigns = new Hono();

// ================================
// BullMQ Queue Setup
// ================================

const campaignQueue = new Queue('campaigns', {
    connection: redis,
    defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
    },
});

// ================================
// Schemas
// ================================

const createSimpleCampaignSchema = z.object({
    name: z.string().min(1).max(100),
    instanceId: z.string().uuid(),
    message: z.object({
        type: z.enum(['text', 'media']),
        text: z.string().optional(),
        mediaUrl: z.string().url().optional(),
        caption: z.string().optional(),
    }),
    recipients: z.array(z.string().min(1)).min(1),
    delay: z.number().min(1000).max(60000).default(5000), // 1s to 60s between messages
});

const createAdvancedCampaignSchema = z.object({
    name: z.string().min(1).max(100),
    instanceId: z.string().uuid(),
    messages: z.array(z.object({
        to: z.string().min(1),
        content: z.object({
            type: z.enum(['text', 'media']),
            text: z.string().optional(),
            mediaUrl: z.string().url().optional(),
            caption: z.string().optional(),
        }),
    })).min(1),
    delay: z.number().min(1000).max(60000).default(5000),
});

const controlCampaignSchema = z.object({
    action: z.enum(['pause', 'resume', 'cancel']),
});

// ================================
// Routes - User Auth
// ================================

/**
 * GET /campaigns
 * List all campaigns for user
 */
campaigns.get('/', authMiddleware, async (c) => {
    const user = c.get('user');

    const campaignsList = await prisma.campaign.findMany({
        where: {
            instance: {
                userId: user.userId,
            },
        },
        include: {
            instance: {
                select: {
                    id: true,
                    name: true,
                },
            },
            _count: {
                select: { messages: true },
            },
        },
        orderBy: { createdAt: 'desc' },
    });

    return c.json({
        success: true,
        data: campaignsList.map(campaign => ({
            id: campaign.id,
            name: campaign.name,
            status: campaign.status,
            instance: campaign.instance,
            totalMessages: campaign.totalMessages,
            sentMessages: campaign.sentMessages,
            failedMessages: campaign.failedMessages,
            progress: campaign.totalMessages > 0
                ? Math.round((campaign.sentMessages / campaign.totalMessages) * 100)
                : 0,
            startedAt: campaign.startedAt,
            completedAt: campaign.completedAt,
            createdAt: campaign.createdAt,
        })),
    });
});

/**
 * POST /campaign/simple
 * Create a simple campaign (same message to multiple recipients)
 */
campaigns.post('/simple', authMiddleware, async (c) => {
    const user = c.get('user');
    const body = await c.req.json();
    const data = createSimpleCampaignSchema.parse(body);

    // Verify instance belongs to user
    const instance = await prisma.instance.findFirst({
        where: {
            id: data.instanceId,
            userId: user.userId,
        },
    });

    if (!instance) {
        throw new HTTPException(404, { message: 'Instance not found' });
    }

    // Create campaign
    const campaign = await prisma.campaign.create({
        data: {
            name: data.name,
            instanceId: data.instanceId,
            delay: data.delay,
            totalMessages: data.recipients.length,
            messages: {
                create: data.recipients.map(to => ({
                    to,
                    content: data.message,
                    status: 'PENDING',
                })),
            },
        },
    });

    return c.json({
        success: true,
        data: {
            id: campaign.id,
            name: campaign.name,
            totalMessages: campaign.totalMessages,
            status: campaign.status,
        },
    });
});

/**
 * POST /campaign/advanced
 * Create an advanced campaign (different messages per recipient)
 */
campaigns.post('/advanced', authMiddleware, async (c) => {
    const user = c.get('user');
    const body = await c.req.json();
    const data = createAdvancedCampaignSchema.parse(body);

    // Verify instance belongs to user
    const instance = await prisma.instance.findFirst({
        where: {
            id: data.instanceId,
            userId: user.userId,
        },
    });

    if (!instance) {
        throw new HTTPException(404, { message: 'Instance not found' });
    }

    // Create campaign
    const campaign = await prisma.campaign.create({
        data: {
            name: data.name,
            instanceId: data.instanceId,
            delay: data.delay,
            totalMessages: data.messages.length,
            messages: {
                create: data.messages.map(msg => ({
                    to: msg.to,
                    content: msg.content,
                    status: 'PENDING',
                })),
            },
        },
    });

    return c.json({
        success: true,
        data: {
            id: campaign.id,
            name: campaign.name,
            totalMessages: campaign.totalMessages,
            status: campaign.status,
        },
    });
});

/**
 * POST /campaign/:id/control
 * Control campaign (start, pause, resume, cancel)
 */
campaigns.post('/:id/control', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');
    const body = await c.req.json();
    const { action } = controlCampaignSchema.parse(body);

    const campaign = await prisma.campaign.findFirst({
        where: {
            id,
            instance: {
                userId: user.userId,
            },
        },
        include: {
            instance: true,
        },
    });

    if (!campaign) {
        throw new HTTPException(404, { message: 'Campaign not found' });
    }

    switch (action) {
        case 'pause':
            if (campaign.status !== 'RUNNING') {
                throw new HTTPException(400, { message: 'Campaign is not running' });
            }
            await prisma.campaign.update({
                where: { id },
                data: { status: 'PAUSED' },
            });
            break;

        case 'resume':
            if (campaign.status !== 'PAUSED') {
                throw new HTTPException(400, { message: 'Campaign is not paused' });
            }
            await prisma.campaign.update({
                where: { id },
                data: { status: 'RUNNING' },
            });
            // Add back to queue
            await campaignQueue.add('process-campaign', { campaignId: id });
            break;

        case 'cancel':
            if (campaign.status === 'COMPLETED' || campaign.status === 'CANCELLED') {
                throw new HTTPException(400, { message: 'Campaign already finished' });
            }
            await prisma.campaign.update({
                where: { id },
                data: { status: 'CANCELLED' },
            });
            break;
    }

    return c.json({
        success: true,
        message: `Campaign ${action}ed successfully`,
    });
});

/**
 * POST /campaign/:id/start
 * Start a campaign
 */
campaigns.post('/:id/start', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');

    const campaign = await prisma.campaign.findFirst({
        where: {
            id,
            instance: {
                userId: user.userId,
            },
        },
        include: {
            instance: true,
        },
    });

    if (!campaign) {
        throw new HTTPException(404, { message: 'Campaign not found' });
    }

    if (campaign.status !== 'PENDING') {
        throw new HTTPException(400, { message: 'Campaign already started or finished' });
    }

    // Check if instance is connected
    const status = waManager.getStatus(campaign.instanceId);
    if (status !== 'connected') {
        throw new HTTPException(400, { message: 'Instance is not connected' });
    }

    // Update campaign status and add to queue
    await prisma.campaign.update({
        where: { id },
        data: {
            status: 'RUNNING',
            startedAt: new Date(),
        },
    });

    await campaignQueue.add('process-campaign', { campaignId: id });

    return c.json({
        success: true,
        message: 'Campaign started successfully',
    });
});

/**
 * GET /campaign/:id
 * Get campaign details
 */
campaigns.get('/:id', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');

    const campaign = await prisma.campaign.findFirst({
        where: {
            id,
            instance: {
                userId: user.userId,
            },
        },
        include: {
            instance: {
                select: {
                    id: true,
                    name: true,
                },
            },
        },
    });

    if (!campaign) {
        throw new HTTPException(404, { message: 'Campaign not found' });
    }

    return c.json({
        success: true,
        data: {
            id: campaign.id,
            name: campaign.name,
            status: campaign.status,
            instance: campaign.instance,
            totalMessages: campaign.totalMessages,
            sentMessages: campaign.sentMessages,
            failedMessages: campaign.failedMessages,
            progress: campaign.totalMessages > 0
                ? Math.round((campaign.sentMessages / campaign.totalMessages) * 100)
                : 0,
            delay: campaign.delay,
            startedAt: campaign.startedAt,
            completedAt: campaign.completedAt,
            createdAt: campaign.createdAt,
        },
    });
});

/**
 * POST /campaign/:id/messages
 * Get messages from a campaign
 */
campaigns.post('/:id/messages', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');
    const body = await c.req.json();

    const schema = z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(50),
        status: z.enum(['all', 'PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED']).default('all'),
    });
    const { page, limit, status } = schema.parse(body);

    const campaign = await prisma.campaign.findFirst({
        where: {
            id,
            instance: {
                userId: user.userId,
            },
        },
    });

    if (!campaign) {
        throw new HTTPException(404, { message: 'Campaign not found' });
    }

    const where: any = { campaignId: id };
    if (status !== 'all') {
        where.status = status;
    }

    const [messages, total] = await Promise.all([
        prisma.message.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { createdAt: 'asc' },
        }),
        prisma.message.count({ where }),
    ]);

    return c.json({
        success: true,
        data: {
            messages,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        },
    });
});

/**
 * DELETE /campaign/:id
 * Delete a campaign
 */
campaigns.delete('/:id', authMiddleware, async (c) => {
    const { id } = c.req.param();
    const user = c.get('user');

    const campaign = await prisma.campaign.findFirst({
        where: {
            id,
            instance: {
                userId: user.userId,
            },
        },
    });

    if (!campaign) {
        throw new HTTPException(404, { message: 'Campaign not found' });
    }

    if (campaign.status === 'RUNNING') {
        throw new HTTPException(400, { message: 'Cannot delete a running campaign' });
    }

    await prisma.campaign.delete({
        where: { id },
    });

    return c.json({
        success: true,
        message: 'Campaign deleted successfully',
    });
});

// ================================
// Campaign Worker
// ================================

export function startCampaignWorker() {
    const worker = new Worker(
        'campaigns',
        async (job: Job) => {
            const { campaignId } = job.data;

            const campaign = await prisma.campaign.findUnique({
                where: { id: campaignId },
                include: { instance: true },
            });

            if (!campaign || campaign.status !== 'RUNNING') {
                return;
            }

            // Get pending messages
            const pendingMessages = await prisma.message.findMany({
                where: {
                    campaignId,
                    status: 'PENDING',
                },
                take: 10, // Process in batches
            });

            if (pendingMessages.length === 0) {
                // All messages processed
                await prisma.campaign.update({
                    where: { id: campaignId },
                    data: {
                        status: 'COMPLETED',
                        completedAt: new Date(),
                    },
                });
                return;
            }

            // Check if instance is still connected
            const instanceStatus = waManager.getStatus(campaign.instanceId);
            if (instanceStatus !== 'connected') {
                logger.warn({ campaignId, instanceId: campaign.instanceId }, 'Instance disconnected, pausing campaign');
                await prisma.campaign.update({
                    where: { id: campaignId },
                    data: { status: 'PAUSED' },
                });
                return;
            }

            // Process messages
            for (const message of pendingMessages) {
                // Check if campaign is still running
                const currentCampaign = await prisma.campaign.findUnique({
                    where: { id: campaignId },
                });

                if (!currentCampaign || currentCampaign.status !== 'RUNNING') {
                    return;
                }

                try {
                    const content = message.content as any;

                    if (content.type === 'text') {
                        await waManager.sendText(campaign.instanceId, message.to, content.text);
                    } else if (content.type === 'media') {
                        await waManager.sendMedia(campaign.instanceId, message.to, content.mediaUrl, {
                            caption: content.caption,
                        });
                    }

                    await prisma.message.update({
                        where: { id: message.id },
                        data: {
                            status: 'SENT',
                            sentAt: new Date(),
                        },
                    });

                    await prisma.campaign.update({
                        where: { id: campaignId },
                        data: {
                            sentMessages: { increment: 1 },
                        },
                    });
                } catch (error) {
                    logger.error({ messageId: message.id, error }, 'Failed to send message');

                    await prisma.message.update({
                        where: { id: message.id },
                        data: {
                            status: 'FAILED',
                            errorMsg: error instanceof Error ? error.message : 'Unknown error',
                        },
                    });

                    await prisma.campaign.update({
                        where: { id: campaignId },
                        data: {
                            failedMessages: { increment: 1 },
                        },
                    });
                }

                // Wait for delay between messages
                await new Promise(resolve => setTimeout(resolve, campaign.delay));
            }

            // Add another job to continue processing
            await campaignQueue.add('process-campaign', { campaignId }, {
                delay: 1000, // 1 second delay before next batch
            });
        },
        {
            connection: redis,
            concurrency: 5, // Process up to 5 campaigns simultaneously
        }
    );

    worker.on('failed', (job, err) => {
        logger.error({ jobId: job?.id, error: err }, 'Campaign job failed');
    });

    logger.info('Campaign worker started');
    return worker;
}

export { campaigns as campaignsRoutes };
