import { Hono } from 'hono';
import { z } from 'zod';
import { waManager } from '../../lib/whatsapp.js';
import { instanceTokenMiddleware } from '../../middlewares/auth.js';
import { HTTPException } from 'hono/http-exception';

const contacts = new Hono();

// All contact routes use instance token authentication
contacts.use('*', instanceTokenMiddleware);

// ================================
// Schemas
// ================================

const verifyNumberSchema = z.object({
    numbers: z.array(z.string().min(1)),
});

const contactIdSchema = z.object({
    contactId: z.string().min(1),
});

// ================================
// Routes
// ================================

/**
 * GET /contacts
 * Get all contacts
 */
contacts.get('/', async (c) => {
    const instanceId = c.get('instanceId');

    try {
        const contactsList = await waManager.getContacts(instanceId);

        return c.json({
            success: true,
            data: contactsList,
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to get contacts',
        });
    }
});

/**
 * POST /contacts/list
 * Get contacts with pagination/filtering
 */
contacts.post('/list', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();

    const schema = z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(50),
        filter: z.enum(['all', 'my_contacts', 'groups']).default('all'),
    });
    const { page, limit, filter } = schema.parse(body);

    try {
        let contactsList = await waManager.getContacts(instanceId);

        // Apply filter
        if (filter === 'my_contacts') {
            contactsList = contactsList.filter((c: any) => c.isMyContact);
        } else if (filter === 'groups') {
            contactsList = contactsList.filter((c: any) => c.isGroup);
        }

        // Paginate
        const total = contactsList.length;
        const start = (page - 1) * limit;
        const paginatedContacts = contactsList.slice(start, start + limit);

        return c.json({
            success: true,
            data: {
                contacts: paginatedContacts,
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
            message: error instanceof Error ? error.message : 'Failed to get contacts',
        });
    }
});

/**
 * POST /contacts/details
 * Get contact details by ID
 */
contacts.post('/details', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const { contactId } = contactIdSchema.parse(body);

    try {
        const contact = await waManager.getContactById(instanceId, contactId);

        return c.json({
            success: true,
            data: contact,
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to get contact details',
        });
    }
});

/**
 * POST /contacts/verify
 * Check if numbers are registered on WhatsApp
 */
contacts.post('/verify', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const { numbers } = verifyNumberSchema.parse(body);

    try {
        const results = await Promise.all(
            numbers.map(async (number) => {
                const isRegistered = await waManager.isRegisteredUser(instanceId, number);
                return {
                    number,
                    isRegistered,
                };
            })
        );

        return c.json({
            success: true,
            data: results,
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to verify numbers',
        });
    }
});

/**
 * POST /contacts/block
 * Block a contact
 */
contacts.post('/block', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const { contactId } = contactIdSchema.parse(body);

    try {
        await waManager.blockContact(instanceId, contactId);

        return c.json({
            success: true,
            message: 'Contact blocked successfully',
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to block contact',
        });
    }
});

/**
 * POST /contacts/unblock
 * Unblock a contact
 */
contacts.post('/unblock', async (c) => {
    const instanceId = c.get('instanceId');
    const body = await c.req.json();
    const { contactId } = contactIdSchema.parse(body);

    try {
        await waManager.unblockContact(instanceId, contactId);

        return c.json({
            success: true,
            message: 'Contact unblocked successfully',
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to unblock contact',
        });
    }
});

/**
 * GET /contacts/blocked
 * Get list of blocked contacts
 */
contacts.get('/blocked', async (c) => {
    const instanceId = c.get('instanceId');

    try {
        const blockedContacts = await waManager.getBlockedContacts(instanceId);

        return c.json({
            success: true,
            data: blockedContacts,
        });
    } catch (error) {
        throw new HTTPException(500, {
            message: error instanceof Error ? error.message : 'Failed to get blocked contacts',
        });
    }
});

export { contacts as contactsRoutes };
