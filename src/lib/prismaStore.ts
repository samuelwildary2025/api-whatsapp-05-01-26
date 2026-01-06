import fs from 'fs/promises';
import path from 'path';
import { prisma } from './prisma.js';
import { logger } from './logger.js';

interface StoreOptions {
    session: string;
    path?: string;
}

export class PrismaStore {
    /**
     * Check if a session exists in the database
     */
    async sessionExists(options: StoreOptions): Promise<boolean> {
        try {
            const session = await prisma.session.findUnique({
                where: { id: options.session },
            });
            return session !== null;
        } catch (error) {
            logger.error({ error, session: options.session }, 'Error checking session existence');
            // Do NOT return false on error, as it will cause the session to be invalidated/logged out.
            throw error;
        }
    }

    /**
     * Save session data to the database
     * Reads the zip file created by RemoteAuth and stores as Base64
     */
    async save(options: StoreOptions): Promise<void> {
        try {
            // RemoteAuth creates a zip file in the current working directory
            const zipPath = path.resolve(process.cwd(), `${options.session}.zip`);

            try {
                await fs.access(zipPath);
            } catch {
                // Format might be diffirent or file not created yet
                logger.warn({ session: options.session, path: zipPath }, 'Session zip file not found during save, skipping.');
                return;
            }

            const buffer = await fs.readFile(zipPath);
            const data = buffer.toString('base64');

            await prisma.session.upsert({
                where: { id: options.session },
                update: {
                    data: data,
                    updatedAt: new Date(),
                },
                create: {
                    id: options.session,
                    data: data,
                },
            });
            logger.debug({ session: options.session }, 'Session saved to database');
        } catch (error) {
            logger.error({ error, session: options.session }, 'Error saving session');
            throw error;
        }
    }

    /**
     * Extract (retrieve) session data from the database
     * Writes the Base64 data back to the file path requested by RemoteAuth
     */
    async extract(options: StoreOptions): Promise<void> {
        try {
            const session = await prisma.session.findUnique({
                where: { id: options.session },
            });

            if (!session) {
                logger.debug({ session: options.session }, 'No session found in database to extract');
                return;
            }

            if (!options.path) {
                logger.error({ session: options.session }, 'Extract called without destination path');
                return;
            }

            const buffer = Buffer.from(session.data, 'base64');
            await fs.writeFile(options.path, buffer);

            logger.debug({ session: options.session }, 'Session extracted from database to file');
        } catch (error) {
            logger.error({ error, session: options.session }, 'Error extracting session');
            throw error;
        }
    }

    /**
     * Delete session data from the database
     */
    async delete(options: StoreOptions): Promise<void> {
        try {
            await prisma.session.delete({
                where: { id: options.session },
            });
            logger.info({ session: options.session }, 'Session deleted from database');
        } catch (error) {
            // Ignore if session doesn't exist
            logger.debug({ error, session: options.session }, 'Error deleting session (may not exist)');
        }
    }
}

// Export singleton instance
export const prismaStore = new PrismaStore();
