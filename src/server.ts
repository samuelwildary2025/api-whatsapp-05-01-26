import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger as honoLogger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { secureHeaders } from 'hono/secure-headers';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { errorHandler } from './middlewares/error.js';

// Routes
import { authRoutes } from './modules/auth/auth.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { instanceRoutes } from './modules/instance/instance.routes.js';
import { messagesRoutes } from './modules/messages/messages.routes.js';
import { contactsRoutes } from './modules/contacts/contacts.routes.js';
import { groupsRoutes } from './modules/groups/groups.routes.js';
import { chatsRoutes } from './modules/chats/chats.routes.js';
import { labelsRoutes } from './modules/labels/labels.routes.js';
import { profileRoutes } from './modules/profile/profile.routes.js';
import { campaignsRoutes, startCampaignWorker } from './modules/campaigns/campaigns.routes.js';
import { webhooksRoutes, setupWebhookListeners } from './modules/webhooks/webhooks.routes.js';
import { waManager } from './lib/whatsapp.js';
import { setupGlobalListeners } from './lib/listeners.js';

// Create Hono app
const app = new Hono();

// ================================
// Global Middlewares
// ================================

app.use('*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Instance-Token', 'X-Admin-Token', 'Accept', 'Origin', 'X-Requested-With'],
    exposeHeaders: ['Content-Length', 'X-Request-Id'],
    maxAge: 86400,
    credentials: false,
}));

// Explicit OPTIONS handler for preflight requests
app.options('*', () => {
    return new Response(null, { status: 204 });
});

app.use('*', secureHeaders());
app.use('*', prettyJSON());

if (env.isDev) {
    app.use('*', honoLogger());
}

// ================================
// Error Handler
// ================================

app.onError(errorHandler);

// ================================
// Health Check
// ================================

app.get('/', (c) => {
    return c.json({
        name: 'WhatsApp API',
        version: '1.0.0',
        status: 'running',
        docs: '/docs',
    });
});

app.get('/health', async (c) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        return c.json({
            status: 'healthy',
            database: 'connected',
            uptime: process.uptime(),
        });
    } catch (error) {
        return c.json({
            status: 'unhealthy',
            database: 'disconnected',
            error: error instanceof Error ? error.message : 'Unknown error',
        }, 503);
    }
});

// ================================
// API Routes
// ================================

// Auth routes (public)
app.route('/auth', authRoutes);

// Admin routes
app.route('/admin', adminRoutes);

// Instance routes
app.route('/instance', instanceRoutes);

// Message routes (via instance token)
app.route('/message', messagesRoutes);

// Contacts routes (via instance token)
app.route('/contacts', contactsRoutes);

// Groups routes (via instance token)
app.route('/group', groupsRoutes);
app.route('/groups', groupsRoutes);

// Chats routes (via instance token)
app.route('/chat', chatsRoutes);
app.route('/chats', chatsRoutes);

// Labels routes (via instance token)
app.route('/labels', labelsRoutes);

// Profile routes (via instance token)
app.route('/profile', profileRoutes);

// Campaign routes
app.route('/campaign', campaignsRoutes);
app.route('/campaigns', campaignsRoutes);

// Webhook routes
app.route('/webhook', webhooksRoutes);
app.route('/sse', webhooksRoutes);

// ================================
// Static Files (Frontend)
// ================================

app.use('/*', serveStatic({ root: './public' }));

// SPA Fallback
app.get('*', serveStatic({ path: './public/index.html' }));

// ================================
// 404 Handler
// ================================

app.notFound((c) => {
    return c.json({
        success: false,
        error: 'Not Found',
        path: c.req.path,
    }, 404);
});

// ================================
// Start Server
// ================================

async function main() {
    try {
        // Test database connection
        await prisma.$connect();
        logger.info('✅ Database connected');

        // Create default admin user if not exists
        const bcrypt = await import('bcryptjs');
        const existingAdmin = await prisma.user.findUnique({
            where: { email: 'admin@admin.com' }
        });

        if (!existingAdmin) {
            const hashedPassword = await bcrypt.default.hash('admin123456', 10);
            await prisma.user.create({
                data: {
                    email: 'admin@admin.com',
                    password: hashedPassword,
                    name: 'Admin',
                    role: 'ADMIN',
                }
            });
            logger.info('✅ Default admin created: admin@admin.com / admin123456');
        }

        // Setup webhook listeners
        setupWebhookListeners();
        setupGlobalListeners();

        // Start campaign worker
        startCampaignWorker();

        // Restore WhatsApp sessions
        await waManager.reconnectAll();

        // Start server
        serve({
            fetch: app.fetch,
            port: env.port,
            hostname: env.host,
        });

        logger.info(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🚀 WhatsApp API Server Started!                          ║
║                                                            ║
║   📍 URL: http://${env.host}:${env.port}                         ║
║   📖 Health: http://${env.host}:${env.port}/health               ║
║   🔧 Environment: ${env.nodeEnv}                             ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
    `);

        // Graceful shutdown
        const shutdown = async () => {
            logger.info('Shutting down...');
            await prisma.$disconnect();
            process.exit(0);
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);

    } catch (error) {
        logger.error({ error }, 'Failed to start server');
        process.exit(1);
    }
}

main();
