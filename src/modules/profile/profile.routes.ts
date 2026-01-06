import { Hono } from 'hono';
import { z } from 'zod';
import { waManager } from '../../lib/whatsapp.js';
import { instanceTokenMiddleware } from '../../middlewares/auth.js';
import { HTTPException } from 'hono/http-exception';

const profile = new Hono();

// All profile routes use instance token authentication
profile.use('*', instanceTokenMiddleware);

// ================================
// Schemas
// ================================

const nameSchema = z.object({
    name: z.string().min(1).max(25),
});

const statusSchema = z.object({
    status: z.string().max(139),
});

const pictureSchema = z.object({
    imageUrl: z.string().url().optional(),
    base64: z.string().optional(),
}).refine(
    (data) => data.imageUrl || data.base64,
    'Either imageUrl or base64 must be provided'
);

// ================================
// Routes
// ================================

/**
 * POST /profile/name
 * Update WhatsApp profile name
 */
profile.post('/name', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const { name } = nameSchema.parse(body);

    try {
        await waManager.setProfileName(instanceId, name);

        return c.json({
            success: true,
            message: 'Profile name updated successfully',
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to update profile name',
        });
    }
});

/**
 * POST /profile/status
 * Update WhatsApp status (about)
 */
profile.post('/status', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const { status } = statusSchema.parse(body);

    try {
        await waManager.setStatus(instanceId, status);

        return c.json({
            success: true,
            message: 'Status updated successfully',
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to update status',
        });
    }
});

/**
 * POST /profile/picture
 * Update WhatsApp profile picture
 */
profile.post('/picture', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const data = pictureSchema.parse(body);

    try {
        if (data.imageUrl) {
            await waManager.setProfilePicture(instanceId, data.imageUrl);
        } else if (data.base64) {
            // For base64, we need to handle it differently
            // whatsapp-web.js expects a MediaMessage for profile picture
            throw new HTTPException(400, {
                message: 'Base64 profile picture not supported yet. Please use imageUrl.',
            });
        }

        return c.json({
            success: true,
            message: 'Profile picture updated successfully',
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to update profile picture',
        });
    }
});

export { profile as profileRoutes };
