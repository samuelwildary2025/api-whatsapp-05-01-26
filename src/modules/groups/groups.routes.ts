import { Hono } from 'hono';
import { z } from 'zod';
import { waManager } from '../../lib/whatsapp.js';
import { instanceTokenMiddleware } from '../../middlewares/auth.js';
import { HTTPException } from 'hono/http-exception';

const groups = new Hono();

// All group routes use instance token authentication
groups.use('*', instanceTokenMiddleware);

// ================================
// Schemas
// ================================

const createGroupSchema = z.object({
    name: z.string().min(1).max(100),
    participants: z.array(z.string().min(1)).min(1),
});

const groupIdSchema = z.object({
    groupId: z.string().min(1),
});

const participantsSchema = z.object({
    groupId: z.string().min(1),
    participants: z.array(z.string().min(1)).min(1),
});

const groupSubjectSchema = z.object({
    groupId: z.string().min(1),
    subject: z.string().min(1).max(100),
});

const groupDescriptionSchema = z.object({
    groupId: z.string().min(1),
    description: z.string().max(500),
});

const inviteCodeSchema = z.object({
    inviteCode: z.string().min(1),
});

// ================================
// Routes
// ================================

/**
 * POST /group/create
 * Create a new group
 */
groups.post('/create', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const data = createGroupSchema.parse(body);

    try {
        const result = await waManager.createGroup(instanceId, data.name, data.participants);

        return c.json({
            success: true,
            data: result,
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to create group',
        });
    }
});

/**
 * POST /group/info
 * Get group information
 */
groups.post('/info', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const { groupId } = groupIdSchema.parse(body);

    try {
        const info = await waManager.getGroupInfo(instanceId, groupId);

        return c.json({
            success: true,
            data: info,
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to get group info',
        });
    }
});

/**
 * GET /groups
 * List all groups
 */
groups.get('/', async (c) => {
    const instanceId = c.get('instanceId');

    try {
        const chats = await waManager.getChats(instanceId);
        const groupsList = chats.filter((chat: any) => chat.isGroup);

        return c.json({
            success: true,
            data: groupsList,
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to list groups',
        });
    }
});

/**
 * POST /groups/list
 * List groups with pagination
 */
groups.post('/list', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();

    const schema = z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(50),
    });
    const { page, limit } = schema.parse(body);

    try {
        const chats = await waManager.getChats(instanceId);
        const allGroups = chats.filter((chat: any) => chat.isGroup);

        const total = allGroups.length;
        const start = (page - 1) * limit;
        const paginatedGroups = allGroups.slice(start, start + limit);

        return c.json({
            success: true,
            data: {
                groups: paginatedGroups,
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
            message: error instanceof Error ? error.message : 'Failed to list groups',
        });
    }
});

/**
 * POST /group/participants/add
 * Add participants to a group
 */
groups.post('/participants/add', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const data = participantsSchema.parse(body);

    try {
        await waManager.addParticipants(instanceId, data.groupId, data.participants);

        return c.json({
            success: true,
            message: 'Participants added successfully',
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to add participants',
        });
    }
});

/**
 * POST /group/participants/remove
 * Remove participants from a group
 */
groups.post('/participants/remove', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const data = participantsSchema.parse(body);

    try {
        await waManager.removeParticipants(instanceId, data.groupId, data.participants);

        return c.json({
            success: true,
            message: 'Participants removed successfully',
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to remove participants',
        });
    }
});

/**
 * POST /group/participants/promote
 * Promote participants to admin
 */
groups.post('/participants/promote', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const data = participantsSchema.parse(body);

    try {
        await waManager.promoteParticipants(instanceId, data.groupId, data.participants);

        return c.json({
            success: true,
            message: 'Participants promoted successfully',
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to promote participants',
        });
    }
});

/**
 * POST /group/participants/demote
 * Demote participants from admin
 */
groups.post('/participants/demote', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const data = participantsSchema.parse(body);

    try {
        await waManager.demoteParticipants(instanceId, data.groupId, data.participants);

        return c.json({
            success: true,
            message: 'Participants demoted successfully',
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to demote participants',
        });
    }
});

/**
 * POST /group/subject
 * Update group subject (name)
 */
groups.post('/subject', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const data = groupSubjectSchema.parse(body);

    try {
        await waManager.setGroupSubject(instanceId, data.groupId, data.subject);

        return c.json({
            success: true,
            message: 'Group subject updated successfully',
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to update group subject',
        });
    }
});

/**
 * POST /group/description
 * Update group description
 */
groups.post('/description', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const data = groupDescriptionSchema.parse(body);

    try {
        await waManager.setGroupDescription(instanceId, data.groupId, data.description);

        return c.json({
            success: true,
            message: 'Group description updated successfully',
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to update group description',
        });
    }
});

/**
 * POST /group/leave
 * Leave a group
 */
groups.post('/leave', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const { groupId } = groupIdSchema.parse(body);

    try {
        await waManager.leaveGroup(instanceId, groupId);

        return c.json({
            success: true,
            message: 'Left group successfully',
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to leave group',
        });
    }
});

/**
 * POST /group/invite-code
 * Get group invite code
 */
groups.post('/invite-code', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const { groupId } = groupIdSchema.parse(body);

    try {
        const inviteCode = await waManager.getInviteCode(instanceId, groupId);

        return c.json({
            success: true,
            data: {
                inviteCode,
                inviteLink: `https://chat.whatsapp.com/${inviteCode}`,
            },
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to get invite code',
        });
    }
});

/**
 * POST /group/revoke-invite
 * Revoke group invite code
 */
groups.post('/revoke-invite', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const { groupId } = groupIdSchema.parse(body);

    try {
        const newInviteCode = await waManager.revokeInviteCode(instanceId, groupId);

        return c.json({
            success: true,
            data: {
                inviteCode: newInviteCode,
                inviteLink: `https://chat.whatsapp.com/${newInviteCode}`,
            },
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to revoke invite code',
        });
    }
});

/**
 * POST /group/join
 * Join a group by invite code
 */
groups.post('/join', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const { inviteCode } = inviteCodeSchema.parse(body);

    try {
        // Extract code from link if full URL is provided
        const code = inviteCode.includes('chat.whatsapp.com/')
            ? inviteCode.split('chat.whatsapp.com/')[1]
            : inviteCode;

        const groupId = await waManager.joinGroupByInviteCode(instanceId, code);

        return c.json({
            success: true,
            data: {
                groupId,
            },
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to join group',
        });
    }
});

export { groups as groupsRoutes };
