// @ts-nocheck - whatsapp-web.js is CommonJS and has typing issues with ESM
import pkg from 'whatsapp-web.js';
const { Client, RemoteAuth, MessageMedia, Location } = pkg;
import { EventEmitter } from 'events';
import * as path from 'path';
import * as os from 'os';
import QRCode from 'qrcode';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import { prisma } from './prisma.js';
import { PrismaStore } from './prismaStore.js';
import proxyChain from 'proxy-chain';

export interface WAInstance {
    client: any;
    id: string;
    status: 'disconnected' | 'connecting' | 'connected' | 'qr';
    qrCode?: string;
    qrCodeBase64?: string;
    anonymizedProxyUrl?: string;
}

export type WAEvent =
    | 'qr'
    | 'ready'
    | 'authenticated'
    | 'auth_failure'
    | 'disconnected'
    | 'message'
    | 'message_create'
    | 'message_ack'
    | 'message_revoke_everyone'
    | 'group_join'
    | 'group_leave'
    | 'group_update'
    | 'call';

export interface InstanceSettings {
    alwaysOnline: boolean;
    ignoreGroups: boolean;
    rejectCalls: boolean;
    readMessages: boolean;
    syncFullHistory: boolean;
}

class WhatsAppManager extends EventEmitter {
    private instances: Map<string, WAInstance> = new Map();
    private instanceSettings: Map<string, InstanceSettings> = new Map();
    private alwaysOnlineIntervals: Map<string, NodeJS.Timeout> = new Map();

    constructor() {
        super();
        // Sessions are now stored in the database via PrismaStore
    }


    async createInstance(instanceId: string): Promise<WAInstance> {
        if (this.instances.has(instanceId)) {
            throw new Error(`Instance ${instanceId} already exists`);
        }

        // Session is stored in database via PrismaStore, no local files needed

        // Fetch instance config (Proxy)
        const instanceConfig = await prisma.instance.findUnique({ where: { id: instanceId } });

        const puppeteerArgs = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process', // Experimental: reduces memory by running in one process
            '--disable-gpu',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-default-apps',
            '--disable-sync',
            '--disable-translate',
            '--hide-scrollbars',
            '--metrics-recording-only',
            '--mute-audio',
            '--no-default-browser-check',
            '--start-maximized',
            '--disable-software-rasterizer',
            '--disable-features=Translate,BackForwardCache,AcceptCHFrame,MediaRouter,OptimizationHints,SitePerProcess', // SitePerProcess disabled saves RAM
            '--disable-client-side-phishing-detection',
            '--disable-component-extensions-with-background-pages',
            '--js-flags="--max-old-space-size=256"', // Force aggressive GC limit
        ];

        // Configure Proxy if exists
        let anonymizedProxyUrl: string | undefined;

        if (instanceConfig?.proxyHost && instanceConfig?.proxyPort) {
            const protocol = instanceConfig.proxyProtocol || 'http';
            let upstreamProxyUrl = `${protocol}://${instanceConfig.proxyHost}:${instanceConfig.proxyPort}`;

            // Add authentication if present
            if (instanceConfig.proxyUsername && instanceConfig.proxyPassword) {
                upstreamProxyUrl = `${protocol}://${instanceConfig.proxyUsername}:${instanceConfig.proxyPassword}@${instanceConfig.proxyHost}:${instanceConfig.proxyPort}`;
            }

            try {
                // Anonymize proxy (create a local open proxy server that forwards to the upstream authenticated proxy)
                // This is required because Chrome --proxy-server flag does not support username:password
                anonymizedProxyUrl = await proxyChain.anonymizeProxy(upstreamProxyUrl);

                puppeteerArgs.push(`--proxy-server=${anonymizedProxyUrl}`);
                logger.info({ instanceId, originalProxy: upstreamProxyUrl, localProxy: anonymizedProxyUrl }, 'Proxy configured and anonymized');
            } catch (error) {
                logger.error({ instanceId, error }, 'Failed to configure proxy');
                // Don't throw, proceed without proxy or user should know? Throwing is better for "Proxy Configured" expectation.
                throw new Error(`Failed to configure proxy: ${error}`);
            }
        }

        // Create explicit temp directory for this instance to avoid conflicts
        const userDataDir = path.join(os.tmpdir(), `whatsapp_${instanceId}`);

        // Create store for RemoteAuth
        const store = new PrismaStore();

        const client = new Client({
            authStrategy: new RemoteAuth({
                clientId: instanceId,
                store: store,
                dataPath: userDataDir, // Base path for RemoteAuth extraction
                backupSyncIntervalMs: 60000,
            }),
            puppeteer: {
                headless: true,
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
                args: puppeteerArgs,
            },
        });

        const instance: WAInstance = {
            client,
            id: instanceId,
            status: 'disconnected',
            anonymizedProxyUrl, // Store for cleanup
        };

        this.setupEventHandlers(instance);
        this.instances.set(instanceId, instance);

        return instance;
    }

    private setupEventHandlers(instance: WAInstance) {
        const { client, id } = instance;

        client.on('qr', async (qr: string) => {
            instance.status = 'qr';
            instance.qrCode = qr;
            instance.qrCodeBase64 = await QRCode.toDataURL(qr);

            logger.info({ instanceId: id }, 'QR Code generated');
            this.emit('qr', { instanceId: id, qr, qrBase64: instance.qrCodeBase64 });

            await this.updateInstanceStatus(id, 'CONNECTING');
        });

        client.on('ready', async () => {
            instance.status = 'connected';
            instance.qrCode = undefined;
            instance.qrCodeBase64 = undefined;

            const info = client.info;
            logger.info({ instanceId: id, number: info.wid.user }, 'WhatsApp connected');

            await prisma.instance.update({
                where: { id },
                data: {
                    status: 'CONNECTED',
                    waNumber: info.wid.user,
                    waName: info.pushname,
                },
            });

            this.emit('ready', { instanceId: id, info });
        });

        client.on('authenticated', () => {
            logger.info({ instanceId: id }, 'WhatsApp authenticated');
            this.emit('authenticated', { instanceId: id });
        });

        client.on('auth_failure', async (msg: any) => {
            instance.status = 'disconnected';
            logger.error({ instanceId: id, error: msg }, 'Auth failure');

            await this.updateInstanceStatus(id, 'DISCONNECTED');
            this.emit('auth_failure', { instanceId: id, error: msg });
        });

        client.on('disconnected', async (reason: any) => {
            instance.status = 'disconnected';
            logger.warn({ instanceId: id, reason }, 'WhatsApp disconnected');

            await this.updateInstanceStatus(id, 'DISCONNECTED');
            this.emit('disconnected', { instanceId: id, reason });
        });

        client.on('message', async (msg: any) => {
            const settings = this.instanceSettings.get(id);

            // Ignore group messages if setting is enabled
            if (settings?.ignoreGroups && msg.from?.endsWith('@g.us')) {
                logger.debug({ instanceId: id }, 'Ignoring group message (ignoreGroups enabled)');
                return;
            }

            // Auto-read messages if setting is enabled
            if (settings?.readMessages && !msg.fromMe) {
                try {
                    const chat = await msg.getChat();
                    await chat.sendSeen();
                } catch (err) {
                    logger.warn({ instanceId: id, err }, 'Failed to auto-read message');
                }
            }

            this.emit('message', { instanceId: id, message: this.formatMessage(msg) });
        });

        client.on('message_create', (msg: any) => {
            const settings = this.instanceSettings.get(id);

            // Ignore group messages if setting is enabled
            if (settings?.ignoreGroups && msg.from?.endsWith('@g.us')) {
                return;
            }

            this.emit('message_create', { instanceId: id, message: this.formatMessage(msg) });
        });

        client.on('message_ack', (msg: any, ack: any) => {
            this.emit('message_ack', { instanceId: id, messageId: msg.id._serialized, ack });
        });

        client.on('message_revoke_everyone', (msg: any, revokedMsg: any) => {
            this.emit('message_revoke_everyone', {
                instanceId: id,
                message: this.formatMessage(msg),
                revokedMessage: revokedMsg ? this.formatMessage(revokedMsg) : null
            });
        });

        client.on('group_join', (notification: any) => {
            this.emit('group_join', { instanceId: id, notification });
        });

        client.on('group_leave', (notification: any) => {
            this.emit('group_leave', { instanceId: id, notification });
        });

        client.on('group_update', (notification: any) => {
            this.emit('group_update', { instanceId: id, notification });
        });

        client.on('call', async (call: any) => {
            const settings = this.instanceSettings.get(id);

            // Reject calls if setting is enabled
            if (settings?.rejectCalls) {
                try {
                    await call.reject();
                    logger.info({ instanceId: id, callId: call.id }, 'Call rejected (rejectCalls enabled)');
                } catch (err) {
                    logger.warn({ instanceId: id, err }, 'Failed to reject call');
                }
            }

            this.emit('call', { instanceId: id, call });
        });
    }

    private formatMessage(msg: any) {
        return {
            id: msg.id._serialized,
            from: msg.from,
            to: msg.to,
            body: msg.body,
            type: msg.type,
            timestamp: msg.timestamp,
            isForwarded: msg.isForwarded,
            isStatus: msg.isStatus,
            isStarred: msg.isStarred,
            fromMe: msg.fromMe,
            hasMedia: msg.hasMedia,
            hasQuotedMsg: msg.hasQuotedMsg,
        };
    }

    private async updateInstanceStatus(instanceId: string, status: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED') {
        try {
            await prisma.instance.update({
                where: { id: instanceId },
                data: { status },
            });
        } catch (error) {
            logger.error({ instanceId, error }, 'Failed to update instance status');
        }
    }

    async connect(instanceId: string): Promise<WAInstance> {
        let instance = this.instances.get(instanceId);

        if (!instance) {
            instance = await this.createInstance(instanceId);
        }

        if (instance.status === 'connected') {
            return instance;
        }

        instance.status = 'connecting';
        await instance.client.initialize();

        return instance;
    }

    async disconnect(instanceId: string): Promise<void> {
        const instance = this.instances.get(instanceId);
        if (!instance) {
            throw new Error(`Instance ${instanceId} not found`);
        }

        await instance.client.destroy();
        instance.status = 'disconnected';

        await this.updateInstanceStatus(instanceId, 'DISCONNECTED');
    }

    async logout(instanceId: string): Promise<void> {
        const instance = this.instances.get(instanceId);
        if (!instance) {
            throw new Error(`Instance ${instanceId} not found`);
        }

        await instance.client.logout();
        await instance.client.destroy();
        instance.status = 'disconnected';

        // Remove session from database
        const store = new PrismaStore();
        await store.delete({ session: `RemoteAuth-${instanceId}` });

        this.instances.delete(instanceId);
        await this.updateInstanceStatus(instanceId, 'DISCONNECTED');
    }

    async deleteInstance(instanceId: string): Promise<void> {
        const instance = this.instances.get(instanceId);

        if (instance) {
            try {
                await instance.client.destroy();
            } catch (error) {
                // Ignore destroy errors
            }
        }

        // Remove session from database
        const store = new PrismaStore();
        await store.delete({ session: `RemoteAuth-${instanceId}` });

        // Close anonymized proxy if exists
        if (instance.anonymizedProxyUrl) {
            try {
                await proxyChain.closeAnonymizedProxy(instance.anonymizedProxyUrl, true); // true to close connections immediately
                logger.info({ instanceId, proxy: instance.anonymizedProxyUrl }, 'Anonymized proxy closed');
            } catch (err) {
                logger.error({ instanceId, err }, 'Failed to close anonymized proxy');
            }
        }

        this.instances.delete(instanceId);
    }

    getInstance(instanceId: string): WAInstance | undefined {
        return this.instances.get(instanceId);
    }

    getClient(instanceId: string): any | undefined {
        return this.instances.get(instanceId)?.client;
    }

    getStatus(instanceId: string): WAInstance['status'] | 'not_found' {
        const instance = this.instances.get(instanceId);
        return instance?.status ?? 'not_found';
    }

    getQRCode(instanceId: string): { qr?: string; qrBase64?: string } {
        const instance = this.instances.get(instanceId);
        return {
            qr: instance?.qrCode,
            qrBase64: instance?.qrCodeBase64,
        };
    }

    getAllInstances(): string[] {
        return Array.from(this.instances.keys());
    }

    // ================================
    // Helper to resolve chatId with LID workaround
    // ================================

    private async resolveChatId(client: any, number: string): Promise<string> {
        const cleanedNumber = number.replace(/\D/g, '');

        // Check if it's a group ID
        if (cleanedNumber.includes('-')) {
            return `${cleanedNumber}@g.us`;
        }

        // Use getNumberId to get the correct WhatsApp ID (with LID)
        const numberId = await client.getNumberId(cleanedNumber);

        if (!numberId) {
            throw new Error(`Number ${number} is not registered on WhatsApp`);
        }

        return numberId._serialized;
    }

    // ================================
    // Message Methods
    // ================================

    async sendText(instanceId: string, to: string, text: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        // Clean the number first
        let cleanedNumber = to.replace(/\D/g, '');

        try {
            // WORKAROUND FOR LID ERROR:
            // Use getNumberId to get the correct WhatsApp ID (with LID) before sending
            const numberId = await client.getNumberId(cleanedNumber);

            if (!numberId) {
                throw new Error(`Number ${to} is not registered on WhatsApp`);
            }

            // Use the correct ID returned by getNumberId
            const chatId = numberId._serialized;
            logger.info({ instanceId, to, chatId }, 'Sending message with resolved chatId');

            const result = await client.sendMessage(chatId, text);
            return this.formatMessage(result);
        } catch (error: any) {
            const errorMessage = error.message || String(error);
            logger.error({ instanceId, to, error: errorMessage }, 'Error during sendMessage');
            throw new Error(`Failed to send message: ${errorMessage}`);
        }
    }

    async sendMedia(
        instanceId: string,
        to: string,
        mediaUrl: string,
        options?: { caption?: string; filename?: string }
    ) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chatId = await this.resolveChatId(client, to);
        const media = await MessageMedia.fromUrl(mediaUrl);

        const result = await client.sendMessage(chatId, media, {
            caption: options?.caption,
        });

        return this.formatMessage(result);
    }

    async sendMediaBase64(
        instanceId: string,
        to: string,
        base64: string,
        mimetype: string,
        options?: { caption?: string; filename?: string }
    ) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chatId = await this.resolveChatId(client, to);
        const media = new MessageMedia(mimetype, base64, options?.filename);

        const result = await client.sendMessage(chatId, media, {
            caption: options?.caption,
        });

        return this.formatMessage(result);
    }

    async sendLocation(instanceId: string, to: string, latitude: number, longitude: number, description?: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chatId = await this.resolveChatId(client, to);
        const location = new Location(latitude, longitude, { name: description });

        const result = await client.sendMessage(chatId, location);
        return this.formatMessage(result);
    }

    async sendContact(instanceId: string, to: string, contactId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chatId = await this.resolveChatId(client, to);
        const contact = await client.getContactById(await this.resolveChatId(client, contactId));

        const result = await client.sendMessage(chatId, contact);
        return this.formatMessage(result);
    }

    async sendPresence(instanceId: string, to: string, presence: 'unavailable' | 'available' | 'composing' | 'recording' | 'paused') {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chatId = await this.resolveChatId(client, to);

        switch (presence) {
            case 'unavailable':
                await client.sendPresenceUnavailable();
                break;
            case 'available':
                await client.sendPresenceAvailable();
                break;
            case 'composing':
                await (await client.getChatById(chatId)).sendStateTyping();
                break;
            case 'recording':
                await (await client.getChatById(chatId)).sendStateRecording();
                break;
            case 'paused':
                await (await client.getChatById(chatId)).clearState();
                break;
        }
    }

    async sendPoll(instanceId: string, to: string, title: string, options: string[], pollOptions?: { allowMultipleAnswers?: boolean }) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chatId = await this.resolveChatId(client, to);
        const poll = new (pkg as any).Poll(title, options, pollOptions);

        const result = await client.sendMessage(chatId, poll);
        return this.formatMessage(result);
    }

    async editMessage(instanceId: string, messageId: string, newText: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const msg = await client.getMessageById(messageId);
        if (!msg) throw new Error('Message not found');

        const result = await msg.edit(newText);
        return result;
    }

    async reactToMessage(instanceId: string, messageId: string, reaction: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const msg = await client.getMessageById(messageId);
        if (!msg) throw new Error('Message not found');

        await msg.react(reaction);
    }

    async deleteMessage(instanceId: string, messageId: string, forEveryone: boolean = true) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const msg = await client.getMessageById(messageId);
        if (!msg) throw new Error('Message not found');

        if (forEveryone) {
            await msg.delete(true);
        } else {
            await msg.delete(false);
        }
    }

    async downloadMedia(
        instanceId: string,
        messageId: string,
        options: {
            returnBase64?: boolean;
            generateMp3?: boolean;
            returnLink?: boolean;
            transcribe?: boolean;
            openaiKey?: string;
            downloadQuoted?: boolean;
        }
    ) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        let msg = await client.getMessageById(messageId);
        if (!msg) throw new Error('Message not found');

        if (options.downloadQuoted && msg.hasQuotedMsg) {
            msg = await msg.getQuotedMessage();
        }

        if (!msg.hasMedia) throw new Error('Message does not contain media');

        const media = await msg.downloadMedia();
        if (!media) throw new Error('Failed to download media');

        const result: any = {
            mimetype: media.mimetype,
            filename: media.filename || 'file',
        };

        if (options.returnBase64) {
            result.base64 = media.data;
        }

        if (options.returnLink) {
            // Ensure public media directory exists
            const publicMediaDir = path.join(process.cwd(), 'public', 'media');
            if (!fs.existsSync(publicMediaDir)) {
                fs.mkdirSync(publicMediaDir, { recursive: true });
            }

            const extension = media.mimetype.split('/')[1]?.split(';')[0] || 'bin';
            const filename = `${messageId}_${Date.now()}.${extension}`;
            const filePath = path.join(publicMediaDir, filename);

            fs.writeFileSync(filePath, media.data, 'base64');

            // In a real scenario, you'd construct the full URL based on your server config
            // For now, returning relative path or assuming a base URL if available
            result.link = `/media/${filename}`;
        }

        // Placeholder for MP3 conversion and Transcription
        // These require external libraries (ffmpeg, openai) which might not be installed
        if (options.generateMp3 && media.mimetype.includes('audio')) {
            // Check if ffmpeg is available (placeholder check)
            // Since we can't easily check or install system deps here, we'll add a warning
            result.warning = "MP3 conversion requires ffmpeg installed on the server. Returning original audio format.";
        }

        if (options.transcribe && media.mimetype.includes('audio')) {
            if (!options.openaiKey) {
                result.transcriptionWarning = "OpenAI API Key required for transcription.";
            } else {
                result.transcriptionWarning = "Transcription requires ffmpeg for audio conversion. Skipping.";
            }
        }

        return result;
    }

    // ================================
    // Contact Methods
    // ================================

    async getContacts(instanceId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const contacts = await client.getContacts();
        return contacts.map((c: any) => ({
            id: c.id._serialized,
            number: c.number,
            name: c.name,
            pushname: c.pushname,
            isUser: c.isUser,
            isGroup: c.isGroup,
            isMyContact: c.isMyContact,
            isBlocked: c.isBlocked,
        }));
    }

    async getContactById(instanceId: string, contactId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const contact = await client.getContactById(this.formatNumber(contactId));
        return {
            id: contact.id._serialized,
            number: contact.number,
            name: contact.name,
            pushname: contact.pushname,
            isUser: contact.isUser,
            isGroup: contact.isGroup,
            isMyContact: contact.isMyContact,
            isBlocked: contact.isBlocked,
        };
    }

    async isRegisteredUser(instanceId: string, number: string): Promise<boolean> {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const numberId = await client.getNumberId(number);
        return numberId !== null;
    }

    async blockContact(instanceId: string, contactId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const contact = await client.getContactById(this.formatNumber(contactId));
        await contact.block();
    }

    async unblockContact(instanceId: string, contactId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const contact = await client.getContactById(this.formatNumber(contactId));
        await contact.unblock();
    }

    async getBlockedContacts(instanceId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const contacts = await client.getBlockedContacts();
        return contacts.map((c: any) => ({
            id: c.id._serialized,
            number: c.number,
            name: c.name,
            pushname: c.pushname,
        }));
    }

    // ================================
    // Chat Methods
    // ================================

    async getChats(instanceId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chats = await client.getChats();
        return chats.map((c: any) => ({
            id: c.id._serialized,
            name: c.name,
            isGroup: c.isGroup,
            unreadCount: c.unreadCount,
            timestamp: c.timestamp,
            archived: c.archived,
            pinned: c.pinned,
            isMuted: c.isMuted,
        }));
    }

    async getChatById(instanceId: string, chatId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(this.formatNumber(chatId));
        return {
            id: chat.id._serialized,
            name: chat.name,
            isGroup: chat.isGroup,
            unreadCount: chat.unreadCount,
            timestamp: chat.timestamp,
            archived: chat.archived,
            pinned: chat.pinned,
            isMuted: chat.isMuted,
        };
    }

    async archiveChat(instanceId: string, chatId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(this.formatNumber(chatId));
        await chat.archive();
    }

    async unarchiveChat(instanceId: string, chatId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(this.formatNumber(chatId));
        await chat.unarchive();
    }

    async pinChat(instanceId: string, chatId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(this.formatNumber(chatId));
        await chat.pin();
    }

    async unpinChat(instanceId: string, chatId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(this.formatNumber(chatId));
        await chat.unpin();
    }

    async muteChat(instanceId: string, chatId: string, unmuteDate: Date) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(this.formatNumber(chatId));
        await chat.mute(unmuteDate);
    }

    async unmuteChat(instanceId: string, chatId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(this.formatNumber(chatId));
        await chat.unmute();
    }

    async markChatAsRead(instanceId: string, chatId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(this.formatNumber(chatId));
        await chat.sendSeen();
    }

    async markChatAsUnread(instanceId: string, chatId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(this.formatNumber(chatId));
        await chat.markUnread();
    }

    async deleteChat(instanceId: string, chatId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(this.formatNumber(chatId));
        await chat.delete();
    }

    async getChatMessages(instanceId: string, chatId: string, limit: number = 50) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(this.formatNumber(chatId));
        const messages = await chat.fetchMessages({ limit });
        return messages.map((m: any) => this.formatMessage(m));
    }

    // ================================
    // Group Methods
    // ================================

    async createGroup(instanceId: string, name: string, participants: string[]) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const formattedParticipants = participants.map(p => this.formatNumber(p));
        const result = await client.createGroup(name, formattedParticipants);

        if (typeof result === 'string') {
            return { gid: result, missingParticipants: [] };
        }

        return {
            gid: result.gid?._serialized || result,
            missingParticipants: result.missingParticipants || [],
        };
    }

    async getGroupInfo(instanceId: string, groupId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(groupId);
        if (!chat.isGroup) throw new Error('Not a group chat');

        const groupChat = chat as any;
        return {
            id: chat.id._serialized,
            name: chat.name,
            description: groupChat.description,
            participants: groupChat.participants?.map((p: any) => ({
                id: p.id._serialized,
                isAdmin: p.isAdmin,
                isSuperAdmin: p.isSuperAdmin,
            })),
            createdAt: groupChat.createdAt,
        };
    }

    async addParticipants(instanceId: string, groupId: string, participants: string[]) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(groupId);
        if (!chat.isGroup) throw new Error('Not a group chat');

        const formattedParticipants = participants.map(p => this.formatNumber(p));
        await (chat as any).addParticipants(formattedParticipants);
    }

    async removeParticipants(instanceId: string, groupId: string, participants: string[]) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(groupId);
        if (!chat.isGroup) throw new Error('Not a group chat');

        const formattedParticipants = participants.map(p => this.formatNumber(p));
        await (chat as any).removeParticipants(formattedParticipants);
    }

    async promoteParticipants(instanceId: string, groupId: string, participants: string[]) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(groupId);
        if (!chat.isGroup) throw new Error('Not a group chat');

        const formattedParticipants = participants.map(p => this.formatNumber(p));
        await (chat as any).promoteParticipants(formattedParticipants);
    }

    async demoteParticipants(instanceId: string, groupId: string, participants: string[]) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(groupId);
        if (!chat.isGroup) throw new Error('Not a group chat');

        const formattedParticipants = participants.map(p => this.formatNumber(p));
        await (chat as any).demoteParticipants(formattedParticipants);
    }

    async setGroupSubject(instanceId: string, groupId: string, subject: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(groupId);
        if (!chat.isGroup) throw new Error('Not a group chat');

        await (chat as any).setSubject(subject);
    }

    async setGroupDescription(instanceId: string, groupId: string, description: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(groupId);
        if (!chat.isGroup) throw new Error('Not a group chat');

        await (chat as any).setDescription(description);
    }

    async leaveGroup(instanceId: string, groupId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(groupId);
        if (!chat.isGroup) throw new Error('Not a group chat');

        await (chat as any).leave();
    }

    async getInviteCode(instanceId: string, groupId: string): Promise<string> {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(groupId);
        if (!chat.isGroup) throw new Error('Not a group chat');

        return await (chat as any).getInviteCode();
    }

    async revokeInviteCode(instanceId: string, groupId: string): Promise<string> {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(groupId);
        if (!chat.isGroup) throw new Error('Not a group chat');

        return await (chat as any).revokeInvite();
    }

    async joinGroupByInviteCode(instanceId: string, inviteCode: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const groupId = await client.acceptInvite(inviteCode);
        return groupId;
    }

    // ================================
    // Profile Methods
    // ================================

    async setProfileName(instanceId: string, name: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        await client.setDisplayName(name);
    }

    async setProfilePicture(instanceId: string, imageUrl: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const media = await MessageMedia.fromUrl(imageUrl);
        await client.setProfilePicture(media);
    }

    async setStatus(instanceId: string, status: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        await client.setStatus(status);
    }

    // ================================
    // Label Methods
    // ================================

    async getLabels(instanceId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        if (!client.getLabels) throw new Error('Labels not supported by this instance version');

        const labels = await client.getLabels();
        return labels.map((l: any) => ({
            id: l.id,
            name: l.name,
            hexColor: l.hexColor,
            count: l.count
        }));
    }

    async getChatLabels(instanceId: string, chatId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(this.formatNumber(chatId));
        if (!chat.getLabels) return [];

        const labels = await chat.getLabels();
        return labels.map((l: any) => ({
            id: l.id,
            name: l.name,
            hexColor: l.hexColor
        }));
    }

    async addLabelToChat(instanceId: string, chatId: string, labelId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(this.formatNumber(chatId));
        if (!chat.changeLabels) throw new Error('Label management not supported on this chat');

        let currentLabels = (await chat.getLabels() || []).map((l: any) => l.id);
        if (!currentLabels.includes(labelId)) {
            await chat.changeLabels([...currentLabels, labelId]);
        }
    }

    async removeLabelFromChat(instanceId: string, chatId: string, labelId: string) {
        const client = this.getClient(instanceId);
        if (!client) throw new Error(`Instance ${instanceId} not connected`);

        const chat = await client.getChatById(this.formatNumber(chatId));
        if (!chat.changeLabels) throw new Error('Label management not supported on this chat');

        let currentLabels = (await chat.getLabels() || []).map((l: any) => l.id);
        await chat.changeLabels(currentLabels.filter((id: string) => id !== labelId));
    }

    // ================================
    // Utility Methods
    // ================================

    async reconnectAll() {
        try {
            logger.info('Restoring sessions...');
            const instances = await prisma.instance.findMany({
                where: { status: 'CONNECTED' }
            });

            logger.info(`Found ${instances.length} sessions to restore`);

            for (const instance of instances) {
                try {
                    logger.info({ instanceId: instance.id }, 'Restoring session');
                    await this.createInstance(instance.id);

                    const client = this.instances.get(instance.id)?.client;
                    if (client) {
                        // Initialize sequentially with delay to prevent CPU/Memory spike
                        await client.initialize().catch((err: any) => {
                            logger.error({ instanceId: instance.id, err }, 'Failed to restore session');
                            this.updateInstanceStatus(instance.id, 'DISCONNECTED');
                        });

                        // Wait 5 seconds before starting next instance
                        await new Promise(resolve => setTimeout(resolve, 5000));
                    }
                } catch (error) {
                    logger.error({ instanceId: instance.id, error }, 'Failed to restore instance');
                    await this.updateInstanceStatus(instance.id, 'DISCONNECTED');
                }
            }
            logger.info(`Restoration process completed for ${instances.length} sessions`);
        } catch (error) {
            logger.error({ error }, 'Failed to restore sessions');
        }
    }

    private formatNumber(number: string): string {
        // Remove all non-numeric characters
        let cleaned = number.replace(/\D/g, '');

        // Add @c.us suffix if not present
        if (!cleaned.includes('@')) {
            // Check if it's a group ID
            if (cleaned.includes('-')) {
                return `${cleaned}@g.us`;
            }
            return `${cleaned}@c.us`;
        }

        return cleaned;
    }

    // ================================
    // Settings Management
    // ================================

    getInstanceSettings(instanceId: string): InstanceSettings | undefined {
        return this.instanceSettings.get(instanceId);
    }

    updateInstanceSettings(instanceId: string, settings: Partial<InstanceSettings>) {
        const currentSettings = this.instanceSettings.get(instanceId) || {
            alwaysOnline: false,
            ignoreGroups: false,
            rejectCalls: false,
            readMessages: false,
            syncFullHistory: false,
        };

        const newSettings = { ...currentSettings, ...settings };
        this.instanceSettings.set(instanceId, newSettings);

        logger.info({ instanceId, settings: newSettings }, 'Instance settings updated');

        // Handle alwaysOnline toggle
        this.handleAlwaysOnline(instanceId, newSettings.alwaysOnline);
    }

    private handleAlwaysOnline(instanceId: string, enabled: boolean) {
        // Clear existing interval if any
        const existingInterval = this.alwaysOnlineIntervals.get(instanceId);
        if (existingInterval) {
            clearInterval(existingInterval);
            this.alwaysOnlineIntervals.delete(instanceId);
        }

        if (enabled) {
            const client = this.getClient(instanceId);
            if (client) {
                // Set available immediately
                client.sendPresenceAvailable().catch((err: any) => {
                    logger.warn({ instanceId, err }, 'Failed to set presence available');
                });

                // Set up interval to keep online (every 4 minutes)
                const interval = setInterval(() => {
                    const c = this.getClient(instanceId);
                    if (c) {
                        c.sendPresenceAvailable().catch((err: any) => {
                            logger.warn({ instanceId, err }, 'Failed to maintain presence available');
                        });
                    }
                }, 4 * 60 * 1000);

                this.alwaysOnlineIntervals.set(instanceId, interval);
                logger.info({ instanceId }, 'Always online enabled');
            }
        } else {
            logger.info({ instanceId }, 'Always online disabled');
        }
    }

    async loadInstanceSettings(instanceId: string) {
        try {
            const instance = await prisma.instance.findUnique({
                where: { id: instanceId },
                select: {
                    alwaysOnline: true,
                    ignoreGroups: true,
                    rejectCalls: true,
                    readMessages: true,
                    syncFullHistory: true,
                },
            });

            if (instance) {
                this.instanceSettings.set(instanceId, instance);
                logger.info({ instanceId, settings: instance }, 'Loaded instance settings');
            }
        } catch (error) {
            logger.error({ instanceId, error }, 'Failed to load instance settings');
        }
    }
}

// Singleton instance
export const waManager = new WhatsAppManager();
