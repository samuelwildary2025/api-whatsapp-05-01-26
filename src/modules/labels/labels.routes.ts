import { Hono } from 'hono';
import { z } from 'zod';
import { waManager } from '../../lib/whatsapp.js';
import { instanceTokenMiddleware } from '../../middlewares/auth.js';
import { HTTPException } from 'hono/http-exception';

const labels = new Hono();

// All label routes use instance token authentication
labels.use('*', instanceTokenMiddleware);

// ================================
// Schemas
// ================================

const manageChatLabelSchema = z.object({
    chatId: z.string().min(1),
    labelId: z.string().min(1),
    action: z.enum(['add', 'remove']),
});

// ================================
// Routes
// ================================

/**
 * GET /labels
 * Get all labels
 */
labels.get('/', async (c) => {
    const instanceId = c.get('instanceId');

    try {
        const labelsList = await waManager.getLabels(instanceId);

        return c.json({
            success: true,
            data: labelsList,
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to get labels',
        });
    }
});

/**
 * POST /labels/chat
 * Manage labels for a chat (add/remove)
 */
labels.post('/chat', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const { chatId, labelId, action } = manageChatLabelSchema.parse(body);

    try {
        if (action === 'add') {
            await waManager.addLabelToChat(instanceId, chatId, labelId);
        } else {
            await waManager.removeLabelFromChat(instanceId, chatId, labelId);
        }

        return c.json({
            success: true,
            message: `Label ${action === 'add' ? 'added to' : 'removed from'} chat successfully`,
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to manage chat label',
        });
    }
});

/**
 * POST /labels/edit
 * Edit a label (Placeholder)
 */
labels.post('/edit', async (c) => {
    // This is a placeholder as editing labels might require specific business API support
    // that varies by WhatsApp Web version.
    return c.json({
        success: false,
        message: 'Edit label not yet implemented',
    }, 501);
});

export { labels as labelsRoutes };
