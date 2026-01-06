import { Hono } from 'hono';
import { z } from 'zod';
import { waManager } from '../../lib/whatsapp.js';
import { instanceTokenMiddleware } from '../../middlewares/auth.js';
import { HTTPException } from 'hono/http-exception';

const chats = new Hono();

// All chat routes use instance token authentication
chats.use('*', instanceTokenMiddleware);

// ================================
// Schemas
// ================================

const chatIdSchema = z.object({
    chatId: z.string().min(1),
});

const muteChatSchema = z.object({
    chatId: z.string().min(1),
    duration: z.enum(['8h', '1w', 'forever']).default('8h'),
});

const searchChatsSchema = z.object({
    page: z.number().min(1).default(1),
    limit: z.number().min(1).max(100).default(50),
    filter: z.enum(['all', 'unread', 'groups', 'contacts', 'archived']).default('all'),
});

// ================================
// Routes
// ================================

/**
 * GET /chats
 * Get all chats
 */
chats.get('/', async (c) => {
    const instanceId = c.get('instanceId');

    try {
        const chatsList = await waManager.getChats(instanceId);

        return c.json({
            success: true,
            data: chatsList,
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to get chats',
        });
    }
});

/**
 * POST /chats/search
 * Search chats with pagination and filters
 */
chats.post('/search', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const { page, limit, filter } = searchChatsSchema.parse(body);

    try {
        let chatsList = await waManager.getChats(instanceId);

        // Apply filters
        switch (filter) {
            case 'unread':
                chatsList = chatsList.filter((chat: any) => chat.unreadCount > 0);
                break;
            case 'groups':
                chatsList = chatsList.filter((chat: any) => chat.isGroup);
                break;
            case 'contacts':
                chatsList = chatsList.filter((chat: any) => !chat.isGroup);
                break;
            case 'archived':
                chatsList = chatsList.filter((chat: any) => chat.archived);
                break;
        }

        // Paginate
        const total = chatsList.length;
        const start = (page - 1) * limit;
        const paginatedChats = chatsList.slice(start, start + limit);

        return c.json({
            success: true,
            data: {
                chats: paginatedChats,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                },
            },
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to search chats',
        });
    }
});

/**
 * POST /chat/info
 * Get chat info by ID
 */
chats.post('/info', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const { chatId } = chatIdSchema.parse(body);

    try {
        const chat = await waManager.getChatById(instanceId, chatId);

        return c.json({
            success: true,
            data: chat,
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to get chat info',
        });
    }
});

/**
 * POST /chat/delete
 * Delete a chat
 */
chats.post('/delete', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const { chatId } = chatIdSchema.parse(body);

    try {
        await waManager.deleteChat(instanceId, chatId);

        return c.json({
            success: true,
            message: 'Chat deleted successfully',
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to delete chat',
        });
    }
});

/**
 * POST /chat/archive
 * Archive a chat
 */
chats.post('/archive', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const { chatId } = chatIdSchema.parse(body);

    try {
        await waManager.archiveChat(instanceId, chatId);

        return c.json({
            success: true,
            message: 'Chat archived successfully',
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to archive chat',
        });
    }
});

/**
 * POST /chat/unarchive
 * Unarchive a chat
 */
chats.post('/unarchive', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const { chatId } = chatIdSchema.parse(body);

    try {
        await waManager.unarchiveChat(instanceId, chatId);

        return c.json({
            success: true,
            message: 'Chat unarchived successfully',
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to unarchive chat',
        });
    }
});

/**
 * POST /chat/pin
 * Pin a chat
 */
chats.post('/pin', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const { chatId } = chatIdSchema.parse(body);

    try {
        await waManager.pinChat(instanceId, chatId);

        return c.json({
            success: true,
            message: 'Chat pinned successfully',
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to pin chat',
        });
    }
});

/**
 * POST /chat/unpin
 * Unpin a chat
 */
chats.post('/unpin', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const { chatId } = chatIdSchema.parse(body);

    try {
        await waManager.unpinChat(instanceId, chatId);

        return c.json({
            success: true,
            message: 'Chat unpinned successfully',
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to unpin chat',
        });
    }
});

/**
 * POST /chat/mute
 * Mute a chat
 */
chats.post('/mute', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const { chatId, duration } = muteChatSchema.parse(body);

    const now = new Date();
    let unmuteDate: Date;

    switch (duration) {
        case '8h':
            unmuteDate = new Date(now.getTime() + 8 * 60 * 60 * 1000);
            break;
        case '1w':
            unmuteDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            break;
        case 'forever':
            unmuteDate = new Date(now.getTime() + 100 * 365 * 24 * 60 * 60 * 1000); // 100 years
            break;
    }

    try {
        await waManager.muteChat(instanceId, chatId, unmuteDate);

        return c.json({
            success: true,
            message: 'Chat muted successfully',
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to mute chat',
        });
    }
});

/**
 * POST /chat/unmute
 * Unmute a chat
 */
chats.post('/unmute', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const { chatId } = chatIdSchema.parse(body);

    try {
        await waManager.unmuteChat(instanceId, chatId);

        return c.json({
            success: true,
            message: 'Chat unmuted successfully',
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to unmute chat',
        });
    }
});

/**
 * POST /chat/unread
 * Mark chat as unread
 */
chats.post('/unread', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const { chatId } = chatIdSchema.parse(body);

    try {
        await waManager.markChatAsUnread(instanceId, chatId);

        return c.json({
            success: true,
            message: 'Chat marked as unread',
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to mark chat as unread',
        });
    }
});

/**
 * POST /chat/read
 * Mark chat as read
 */
chats.post('/read', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const { chatId } = chatIdSchema.parse(body);

    try {
        await waManager.markChatAsRead(instanceId, chatId);

        return c.json({
            success: true,
            message: 'Chat marked as read',
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to mark chat as read',
        });
    }
});

/**
 * POST /chat/messages
 * Get messages from a chat
 */
chats.post('/messages', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();

    const schema = z.object({
        chatId: z.string().min(1),
        limit: z.number().min(1).max(500).default(50),
    });
    const { chatId, limit } = schema.parse(body);

    try {
        const messages = await waManager.getChatMessages(instanceId, chatId, limit);

        return c.json({
            success: true,
            data: messages,
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to get messages',
        });
    }
});

export { chats as chatsRoutes };
