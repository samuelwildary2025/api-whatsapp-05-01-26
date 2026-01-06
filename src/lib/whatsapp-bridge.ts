import { EventEmitter } from 'node:events';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import WebSocket, { MessageEvent } from 'ws';
import { logger } from './logger.js';
import { env } from '../config/env.js';

export interface WAInstance {
    id: string;
    status: 'disconnected' | 'connecting' | 'connected' | 'qr';
    qrCode?: string;
    qrCodeBase64?: string;
    waNumber?: string;
    waName?: string;
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

interface WhatsmeowEvent {
    type: string;
    instanceId: string;
    data: Record<string, unknown>;
    timestamp: number;
}

/**
 * WhatsApp Manager Bridge
 * Connects to the Go whatsmeow microservice via HTTP/WebSocket
 */
class WhatsAppBridge extends EventEmitter {
    private baseUrl: string;
    private wsConnections: Map<string, WebSocket> = new Map();
    private instances: Map<string, WAInstance> = new Map();
    private reconnectTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

    constructor() {
        super();
        this.baseUrl = env.whatsmeowUrl || process.env.WHATSMEOW_URL || 'http://localhost:8081';
        logger.info({ baseUrl: this.baseUrl }, 'WhatsApp Bridge initialized');
    }

    /**
     * Make HTTP request to whatsmeow service
     */
    private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
        const url = `${this.baseUrl}${path}`;

        try {
            const response = await fetch(url, {
                ...options,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers,
                },
            });

            const data = await response.json() as { success: boolean; error?: string; data?: T };

            if (!data.success) {
                throw new Error(data.error || 'Request failed');
            }

            return data.data as T;
        } catch (error) {
            logger.error({ url, error }, 'Whatsmeow request failed');
            throw error;
        }
    }

    /**
     * Connect WebSocket for real-time events
     */
    private connectWebSocket(instanceId: string): void {
        // Close existing connection if any
        this.disconnectWebSocket(instanceId);

        const wsUrl = this.baseUrl.replace('http', 'ws') + `/ws/${instanceId}`;

        try {
            const ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                logger.info({ instanceId }, 'WebSocket connected to whatsmeow');
            };

            ws.onmessage = (event: MessageEvent) => {
                try {
                    const eventData: WhatsmeowEvent = JSON.parse(String(event.data));
                    this.handleEvent(eventData);
                } catch (err) {
                    logger.error({ err }, 'Failed to parse WebSocket message');
                }
            };

            ws.onclose = () => {
                logger.warn({ instanceId }, 'WebSocket disconnected');
                this.wsConnections.delete(instanceId);

                // Reconnect after delay
                const timer = setTimeout(() => {
                    if (this.instances.has(instanceId)) {
                        this.connectWebSocket(instanceId);
                    }
                }, 5000);
                this.reconnectTimers.set(instanceId, timer);
            };

            ws.onerror = (err) => {
                logger.error({ instanceId, err }, 'WebSocket error');
            };

            this.wsConnections.set(instanceId, ws);
        } catch (err) {
            logger.error({ instanceId, err }, 'Failed to connect WebSocket');
        }
    }

    /**
     * Disconnect WebSocket
     */
    private disconnectWebSocket(instanceId: string): void {
        const ws = this.wsConnections.get(instanceId);
        if (ws) {
            ws.close();
            this.wsConnections.delete(instanceId);
        }

        const timer = this.reconnectTimers.get(instanceId);
        if (timer) {
            clearTimeout(timer);
            this.reconnectTimers.delete(instanceId);
        }
    }

    /**
     * Handle event from whatsmeow
     */
    private handleEvent(event: WhatsmeowEvent): void {
        const { type, instanceId, data } = event;

        // Update local instance state
        const instance = this.instances.get(instanceId);
        if (instance) {
            if (type === 'qr') {
                instance.status = 'qr';
                instance.qrCode = data.qr as string;
                instance.qrCodeBase64 = data.qrBase64 as string;
            } else if (type === 'ready') {
                instance.status = 'connected';
                instance.qrCode = undefined;
                instance.qrCodeBase64 = undefined;
                instance.waNumber = data.number as string;
                instance.waName = data.name as string;
            } else if (type === 'disconnected' || type === 'logged_out') {
                instance.status = 'disconnected';
            }
        }

        // Map whatsmeow events to whatsapp-web.js compatible events
        const eventMap: Record<string, WAEvent> = {
            'qr': 'qr',
            'ready': 'ready',
            'connected': 'authenticated',
            'disconnected': 'disconnected',
            'logged_out': 'auth_failure',
            'message': 'message',
            'message_ack': 'message_ack',
        };

        const mappedEvent = eventMap[type] || type;

        // Emit with instanceId for webhook system
        this.emit(mappedEvent as WAEvent, {
            instanceId,
            ...data,
        });

        logger.debug({ type, instanceId }, 'Event emitted');
    }

    /**
     * Connect instance to WhatsApp
     */
    async connect(instanceId: string): Promise<WAInstance> {
        logger.info({ instanceId }, 'Connecting instance');

        const data = await this.request<Record<string, unknown>>(`/instance/${instanceId}/connect`, {
            method: 'POST',
        });

        const instance: WAInstance = {
            id: instanceId,
            status: data.status as WAInstance['status'],
            qrCodeBase64: data.qrCode as string,
            waNumber: data.waNumber as string,
        };

        this.instances.set(instanceId, instance);

        // Connect WebSocket for events
        this.connectWebSocket(instanceId);

        return instance;
    }

    /**
     * Disconnect instance
     */
    async disconnect(instanceId: string): Promise<void> {
        logger.info({ instanceId }, 'Disconnecting instance');

        await this.request(`/instance/${instanceId}/disconnect`, {
            method: 'POST',
        });

        const instance = this.instances.get(instanceId);
        if (instance) {
            instance.status = 'disconnected';
        }
    }

    /**
     * Logout instance (remove session)
     */
    async logout(instanceId: string): Promise<void> {
        logger.info({ instanceId }, 'Logging out instance');

        await this.request(`/instance/${instanceId}/logout`, {
            method: 'POST',
        });

        this.disconnectWebSocket(instanceId);
        this.instances.delete(instanceId);
    }

    /**
     * Delete instance
     */
    async deleteInstance(instanceId: string): Promise<void> {
        await this.logout(instanceId);
    }

    /**
     * Get instance
     */
    getInstance(instanceId: string): WAInstance | undefined {
        return this.instances.get(instanceId);
    }

    /**
     * Get WhatsApp client (returns instance for compatibility)
     */
    getClient(instanceId: string): WAInstance | undefined {
        return this.instances.get(instanceId);
    }

    /**
     * Get instance status
     */
    getStatus(instanceId: string): WAInstance['status'] | 'not_found' {
        const instance = this.instances.get(instanceId);
        return instance?.status ?? 'not_found';
    }

    /**
     * Get QR code
     */
    getQRCode(instanceId: string): { qr?: string; qrBase64?: string } {
        const instance = this.instances.get(instanceId);
        return {
            qr: instance?.qrCode,
            qrBase64: instance?.qrCodeBase64,
        };
    }

    /**
     * Get all instances
     */
    getAllInstances(): string[] {
        return Array.from(this.instances.keys());
    }

    /**
     * Reconnect all instances from database
     */
    async reconnectAll(): Promise<void> {
        // This will be called at startup to reconnect saved sessions
        // The whatsmeow service handles session persistence
        logger.info('Reconnect all called - whatsmeow handles session persistence');
    }

    /**
     * Update instance settings
     */
    updateInstanceSettings(_instanceId: string, _settings: Partial<InstanceSettings>): void {
        // Settings are stored in Prisma, no need to pass to whatsmeow
    }

    // ================================
    // Message Methods
    // ================================

    async sendText(instanceId: string, to: string, text: string) {
        const cleanedNumber = to.replace(/\D/g, '');

        const data = await this.request<Record<string, unknown>>('/message/text', {
            method: 'POST',
            body: JSON.stringify({
                instanceId,
                to: cleanedNumber,
                text,
            }),
        });

        return {
            id: data.messageId as string,
            from: '',
            to: cleanedNumber,
            body: text,
            type: 'text',
            timestamp: Date.now() / 1000,
            fromMe: true,
        };
    }

    async sendMedia(
        instanceId: string,
        to: string,
        mediaUrl: string,
        options?: { caption?: string; filename?: string }
    ) {
        const cleanedNumber = to.replace(/\D/g, '');

        const data = await this.request<Record<string, unknown>>('/message/media', {
            method: 'POST',
            body: JSON.stringify({
                instanceId,
                to: cleanedNumber,
                mediaUrl,
                caption: options?.caption,
            }),
        });

        return {
            id: data.messageId as string,
            to: cleanedNumber,
            type: 'media',
            fromMe: true,
        };
    }

    async sendMediaBase64(
        instanceId: string,
        to: string,
        base64: string,
        mimetype: string,
        options?: { caption?: string; filename?: string }
    ) {
        const dataUrl = `data:${mimetype};base64,${base64}`;
        return this.sendMedia(instanceId, to, dataUrl, options);
    }

    async sendLocation(instanceId: string, to: string, latitude: number, longitude: number, description?: string) {
        const cleanedNumber = to.replace(/\D/g, '');

        const data = await this.request<Record<string, unknown>>('/message/location', {
            method: 'POST',
            body: JSON.stringify({
                instanceId,
                to: cleanedNumber,
                latitude,
                longitude,
                description,
            }),
        });

        return {
            id: data.messageId as string,
            to: cleanedNumber,
            type: 'location',
            fromMe: true,
        };
    }

    // Stub methods - not yet implemented in whatsmeow service
    async sendContact(_i: string, _t: string, _c: string) {
        logger.warn('sendContact not implemented in bridge');
        return {};
    }

    async getLabels(_i: string) {
        logger.warn('getLabels not implemented in bridge');
        return [];
    }

    async addLabelToChat(_i: string, _c: string, _l: string) {
        logger.warn('addLabelToChat not implemented in bridge');
    }

    async removeLabelFromChat(_i: string, _c: string, _l: string) {
        logger.warn('removeLabelFromChat not implemented in bridge');
    }

    async loadInstanceSettings(_i: string) {
        // No-op for bridge as settings are managed by Go service or database
    }

    async setProfileName(_instanceId: string, _name: string) {
        logger.warn('setProfileName not implemented in bridge');
    }

    async setStatus(_instanceId: string, _status: string) {
        logger.warn('setStatus not implemented in bridge');
    }

    async setProfilePicture(_instanceId: string, _image: string | Buffer) {
        logger.warn('setProfilePicture not implemented in bridge');
    }

    async sendPresence(instanceId: string, to: string, presence: string) {
        const cleanedNumber = to.replace(/\D/g, '');

        await this.request<void>('/message/presence', {
            method: 'POST',
            body: JSON.stringify({
                instanceId,
                to: cleanedNumber,
                presence,
            }),
        });
    }
    async sendPoll(_i: string, _t: string, _ti: string, _o: string[], _po?: object) { throw new Error('Not implemented'); }
    async editMessage(_i: string, _m: string, _n: string) { throw new Error('Not implemented'); }
    async reactToMessage(_i: string, _m: string, _r: string) { throw new Error('Not implemented'); }
    async deleteMessage(_i: string, _m: string, _f?: boolean) { throw new Error('Not implemented'); }
    async downloadMedia(_i: string, _m: string, _o?: object) { throw new Error('Not implemented'); }
    async getContacts(_i: string) { return []; }
    async getContactById(_i: string, _c: string) { throw new Error('Not implemented'); }
    async isRegisteredUser(_i: string, _n: string): Promise<boolean> { return true; }
    async blockContact(_i: string, _c: string) { throw new Error('Not implemented'); }
    async unblockContact(_i: string, _c: string) { throw new Error('Not implemented'); }
    async getBlockedContacts(_i: string) { return []; }
    async getChats(_i: string) { return []; }
    async getChatById(_i: string, _c: string) { throw new Error('Not implemented'); }
    async archiveChat(_i: string, _c: string) { throw new Error('Not implemented'); }
    async unarchiveChat(_i: string, _c: string) { throw new Error('Not implemented'); }
    async pinChat(_i: string, _c: string) { throw new Error('Not implemented'); }
    async unpinChat(_i: string, _c: string) { throw new Error('Not implemented'); }
    async muteChat(_i: string, _c: string) { throw new Error('Not implemented'); }
    async unmuteChat(_i: string, _c: string) { throw new Error('Not implemented'); }
    async deleteChat(_i: string, _c: string) { throw new Error('Not implemented'); }
    async searchMessages(_i: string, _q: string, _o?: object) { return []; }
    async getGroups(_i: string) { return []; }
    async createGroup(_i: string, _n: string, _p: string[]) { throw new Error('Not implemented'); }
    async getGroupInfo(_i: string, _g: string) { throw new Error('Not implemented'); }
    async addParticipants(_i: string, _g: string, _p: string[]) { throw new Error('Not implemented'); }
    async removeParticipants(_i: string, _g: string, _p: string[]) { throw new Error('Not implemented'); }
    async promoteParticipants(_i: string, _g: string, _p: string[]) { throw new Error('Not implemented'); }
    async demoteParticipants(_i: string, _g: string, _p: string[]) { throw new Error('Not implemented'); }
    async leaveGroup(_i: string, _g: string) { throw new Error('Not implemented'); }
    async getInviteCode(_i: string, _g: string): Promise<string> { throw new Error('Not implemented'); }
    async getProfilePicUrl(_i: string, _c: string): Promise<string | null> { return null; }
    async setGroupSubject(_i: string, _g: string, _s: string) { throw new Error('Not implemented'); }
    async setGroupDescription(_i: string, _g: string, _d: string) { throw new Error('Not implemented'); }
    async revokeInviteCode(_i: string, _g: string): Promise<string> { throw new Error('Not implemented'); }
    async joinGroupByInviteCode(_i: string, _c: string) { throw new Error('Not implemented'); }
    async getChatMessages(_i: string, _c: string, _o?: object) { return []; }

}

// Export singleton instance
export const waManager = new WhatsAppBridge();
