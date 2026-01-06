
import { waManager } from './whatsapp.js';
import { prisma } from './prisma.js';
import { logger } from './logger.js';

export function setupGlobalListeners() {
    // Listen for 'ready' event to update instance data in database
    waManager.on('ready', async (data) => {
        const { instanceId, number, name } = data;

        logger.info({ instanceId, number, name }, 'Received ready event, updating database');

        try {
            await prisma.instance.update({
                where: { id: instanceId },
                data: {
                    status: 'CONNECTED',
                    waNumber: number,
                    waName: name || 'WhatsApp User'
                }
            });
            logger.info({ instanceId }, 'Database updated with instance metadata');
        } catch (error) {
            logger.error({ instanceId, error }, 'Failed to update instance metadata in database');
        }
    });

    // Listen for 'disconnected' event
    waManager.on('disconnected', async (data) => {
        const { instanceId } = data;
        try {
            await prisma.instance.update({
                where: { id: instanceId },
                data: { status: 'DISCONNECTED' }
            });
        } catch (error) {
            logger.error({ instanceId, error }, 'Failed to update disconnected status');
        }
    });

    logger.info('Global listeners setup complete');
}
