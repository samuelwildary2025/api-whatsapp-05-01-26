import { Hono } from 'hono';
import { z } from 'zod';
import { waManager } from '../../lib/whatsapp.js';
import { instanceTokenMiddleware } from '../../middlewares/auth.js';
import { HTTPException } from 'hono/http-exception';

const messages = new Hono();

// Add CORS headers for browser fetch requests
    messages.use('*', async (c, next) => {
        // Handle preflight requests
        if (c.req.method === 'OPTIONS') {
            c.header('Access-Control-Allow-Origin', '*');
            c.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
            c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Instance-Token');
            return c.text('', 204 as any);
        }
        await next();
        c.header('Access-Control-Allow-Origin', '*');
        return;
    });

// All message routes use instance token authentication
messages.use('*', instanceTokenMiddleware);

// ================================
// Schemas
// ================================

const textMessageSchema = z.object({
    to: z.string().min(1),
    text: z.string().min(1),
});

const mediaMessageSchema = z.object({
    to: z.string().min(1),
    mediaUrl: z.string().url().optional(),
    base64: z.string().optional(),
    mimetype: z.string().optional(),
    caption: z.string().optional(),
    filename: z.string().optional(),
}).refine(
    (data) => data.mediaUrl || (data.base64 && data.mimetype),
    'Either mediaUrl or base64+mimetype must be provided'
);

const locationMessageSchema = z.object({
    to: z.string().min(1),
    latitude: z.number(),
    longitude: z.number(),
    description: z.string().optional(),
});

const contactMessageSchema = z.object({
    to: z.string().min(1),
    contactId: z.string().min(1),
});

const presenceSchema = z.object({
    to: z.string().min(1),
    presence: z.enum(['unavailable', 'available', 'composing', 'recording', 'paused']),
});

const pollSchema = z.object({
    to: z.string().min(1),
    title: z.string().min(1),
    options: z.array(z.string().min(1)).min(2).max(12),
    allowMultipleAnswers: z.boolean().default(false),
});

const reactionSchema = z.object({
    messageId: z.string().min(1),
    reaction: z.string().min(1),
});

const deleteMessageSchema = z.object({
    messageId: z.string().min(1),
    forEveryone: z.boolean().default(true),
});

const editMessageSchema = z.object({
    messageId: z.string().min(1),
    newText: z.string().min(1),
});

const searchMessagesSchema = z.object({
    chatId: z.string().min(1),
    limit: z.number().min(1).max(500).default(50),
});

const downloadMediaSchema = z.object({
    id: z.string().min(1),
    return_base64: z.boolean().default(false),
    generate_mp3: z.boolean().default(true),
    return_link: z.boolean().default(true),
    transcribe: z.boolean().default(false),
    openai_apikey: z.string().optional(),
    download_quoted: z.boolean().default(false),
});

// ================================
// Send Message Routes
// ================================

/**
 * POST /message/text
 * Send a text message
 */
messages.post('/text', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const data = textMessageSchema.parse(body);

    try {
        const result = await waManager.sendText(instanceId, data.to, data.text);

        return c.json({
            success: true,
            data: result,
        });
    } catch (error) {
        // Enhanced error logging
        const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
        console.error(`[Message Send Error] Instance: ${instanceId}, To: ${data.to}, Error: ${errorMessage}`);
        
        throw new HTTPException(500, {
            message: errorMessage,
        });
    }
});

/**
 * POST /message/media
 * Send media (image, video, audio, document)
 */
messages.post('/media', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const data = mediaMessageSchema.parse(body);

    try {
        let result;

        if (data.mediaUrl) {
            result = await waManager.sendMedia(instanceId, data.to, data.mediaUrl, {
                caption: data.caption,
                filename: data.filename,
            });
        } else if (data.base64 && data.mimetype) {
            result = await waManager.sendMediaBase64(
                instanceId,
                data.to,
                data.base64,
                data.mimetype,
                {
                    caption: data.caption,
                    filename: data.filename,
                }
            );
        } else {
            throw new Error('Invalid media data');
        }

        return c.json({
            success: true,
            data: result,
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to send media',
        });
    }
});

/**
 * POST /message/location
 * Send a location
 */
messages.post('/location', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const data = locationMessageSchema.parse(body);

    try {
        const result = await waManager.sendLocation(
            instanceId,
            data.to,
            data.latitude,
            data.longitude,
            data.description
        );

        return c.json({
            success: true,
            data: result,
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to send location',
        });
    }
});

/**
 * POST /message/contact
 * Send a contact card (vCard)
 */
messages.post('/contact', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const data = contactMessageSchema.parse(body);

    try {
        const result = await waManager.sendContact(instanceId, data.to, data.contactId);

        return c.json({
            success: true,
            data: result,
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to send contact',
        });
    }
});

/**
 * POST /message/presence
 * Send presence update (typing, recording, etc)
 */
messages.post('/presence', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const data = presenceSchema.parse(body);

    try {
        await waManager.sendPresence(instanceId, data.to, data.presence);

        return c.json({
            success: true,
            message: `Presence set to ${data.presence}`,
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to set presence',
        });
    }
});

/**
 * POST /message/poll
 * Send a poll
 */
messages.post('/poll', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const data = pollSchema.parse(body);

    try {
        const result = await waManager.sendPoll(
            instanceId,
            data.to,
            data.title,
            data.options,
            { allowMultipleAnswers: data.allowMultipleAnswers }
        );

        return c.json({
            success: true,
            data: result,
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to send poll',
        });
    }
});

/**
 * POST /message/edit
 * Edit a message
 */
messages.post('/edit', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const data = editMessageSchema.parse(body);

    try {
        const result = await waManager.editMessage(instanceId, data.messageId, data.newText);

        return c.json({
            success: true,
            data: result,
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to edit message',
        });
    }
});

/**
 * POST /message/download
 * Download message file
 */
messages.post('/download', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const data = downloadMediaSchema.parse(body);

    try {
        const result = await waManager.downloadMedia(
            instanceId, 
            data.id, 
            {
                returnBase64: data.return_base64,
                generateMp3: data.generate_mp3,
                returnLink: data.return_link,
                transcribe: data.transcribe,
                openaiKey: data.openai_apikey,
                downloadQuoted: data.download_quoted
            }
        );

        return c.json({
            success: true,
            data: result,
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to download media',
        });
    }
});

// ================================
// Message Actions
// ================================

/**
 * POST /message/react
 * React to a message
 */
messages.post('/react', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const data = reactionSchema.parse(body);

    try {
        await waManager.reactToMessage(instanceId, data.messageId, data.reaction);

        return c.json({
            success: true,
            message: 'Reaction sent successfully',
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to send reaction',
        });
    }
});

/**
 * POST /message/delete
 * Delete a message
 */
messages.post('/delete', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const data = deleteMessageSchema.parse(body);

    try {
        await waManager.deleteMessage(instanceId, data.messageId, data.forEveryone);

        return c.json({
            success: true,
            message: 'Message deleted successfully',
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to delete message',
        });
    }
});

/**
 * POST /message/search
 * Search messages in a chat
 */
messages.post('/search', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const data = searchMessagesSchema.parse(body);

    try {
        const messages = await waManager.getChatMessages(instanceId, data.chatId, data.limit);

        return c.json({
            success: true,
            data: messages,
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to search messages',
        });
    }
});

/**
 * POST /message/read
 * Mark chat as read
 */
messages.post('/read', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const { chatId } = z.object({ chatId: z.string().min(1) }).parse(body);

    try {
        await waManager.markChatAsRead(instanceId, chatId);

        return c.json({
            success: true,
            message: 'Chat marked as read',
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to mark as read',
        });
    }
});

export { messages as messagesRoutes };
