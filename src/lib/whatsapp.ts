/**
 * WhatsApp Manager Export
 * 
 * Este arquivo exporta o gerenciador correto baseado na variável USE_WHATSMEOW.
 * 
 * Para usar whatsmeow (Go): USE_WHATSMEOW=true
 * Para usar whatsapp-web.js (Puppeteer): USE_WHATSMEOW=false ou não definido
 */

import { EventEmitter } from 'events';

// Re-export types from bridge (compatible with both)
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

export interface WAInstance {
    id: string;
    status: 'disconnected' | 'connecting' | 'connected' | 'qr';
    qrCode?: string;
    qrCodeBase64?: string;
    waNumber?: string;
    waName?: string;
}

export interface InstanceSettings {
    alwaysOnline: boolean;
    ignoreGroups: boolean;
    rejectCalls: boolean;
    readMessages: boolean;
    syncFullHistory: boolean;
}

// Check which implementation to use
const useWhatsmeow = process.env.USE_WHATSMEOW === 'true';

// Interface defining the contract for both Puppeteeer and Bridge implementations
export interface IWhatsAppManager extends EventEmitter {
    // Instance Management
    createInstance(instanceId: string): Promise<any>;
    connect(instanceId: string): Promise<any>;
    connectWithPairingCode(instanceId: string, phoneNumber: string): Promise<{ pairingCode: string }>;
    disconnect(instanceId: string): Promise<void>;
    logout(instanceId: string): Promise<void>;
    deleteInstance(instanceId: string): Promise<void>;
    getInstance(instanceId: string): any;
    getAllInstances(): string[];
    getStatus(instanceId: string): 'disconnected' | 'connecting' | 'connected' | 'qr' | 'not_found';
    getQRCode(instanceId: string): { qr?: string; qrBase64?: string };
    getClient(instanceId: string): any;
    loadInstanceSettings(instanceId: string): Promise<void>;
    updateInstanceSettings(instanceId: string, settings: any): Promise<void>;
    setProxy(instanceId: string, proxy: { proxyHost: string; proxyPort: string; proxyUsername: string; proxyPassword: string; proxyProtocol: string }): Promise<void>;
    reconnectAll(): Promise<void>;

    // Messages
    sendText(instanceId: string, to: string, text: string): Promise<any>;
    sendMedia(instanceId: string, to: string, mediaUrl: string, options?: any): Promise<any>;
    sendMediaBase64(instanceId: string, to: string, base64: string, mimetype: string, options?: any): Promise<any>;
    sendLocation(instanceId: string, to: string, latitude: number, longitude: number, description?: string): Promise<any>;
    sendContact(instanceId: string, to: string, contactId: string): Promise<any>;
    sendPresence(instanceId: string, to: string, presence: string): Promise<void>;
    sendPoll(instanceId: string, to: string, title: string, options: string[], pollOptions?: any): Promise<any>;
    editMessage(instanceId: string, chatId: string, messageId: string, newText: string): Promise<any>;
    reactToMessage(instanceId: string, chatId: string, messageId: string, reaction: string): Promise<void>;
    deleteMessage(instanceId: string, chatId: string, messageId: string, forEveryone?: boolean): Promise<void>;
    downloadMedia(instanceId: string, messageId: string, options: any): Promise<any>;

    // Chats
    getChats(instanceId: string): Promise<any[]>;
    getChatById(instanceId: string, chatId: string): Promise<any>;
    getChatMessages(instanceId: string, chatId: string, options?: any): Promise<any[]>;
    deleteChat(instanceId: string, chatId: string): Promise<void>;
    archiveChat(instanceId: string, chatId: string): Promise<void>;
    unarchiveChat(instanceId: string, chatId: string): Promise<void>;
    pinChat(instanceId: string, chatId: string): Promise<void>;
    unpinChat(instanceId: string, chatId: string): Promise<void>;
    muteChat(instanceId: string, chatId: string, duration?: Date | null): Promise<void>;
    unmuteChat(instanceId: string, chatId: string): Promise<void>;
    markChatAsUnread(instanceId: string, chatId: string): Promise<void>;
    markChatAsRead(instanceId: string, chatId: string): Promise<void>;

    // Contacts
    getContacts(instanceId: string): Promise<any[]>;
    getContactById(instanceId: string, contactId: string): Promise<any>;
    isRegisteredUser(instanceId: string, number: string): Promise<boolean>;
    blockContact(instanceId: string, contactId: string): Promise<void>;
    unblockContact(instanceId: string, contactId: string): Promise<void>;
    getBlockedContacts(instanceId: string): Promise<any[]>;

    // Groups
    createGroup(instanceId: string, name: string, participants: string[]): Promise<any>;
    getGroupInfo(instanceId: string, groupId: string): Promise<any>;
    addParticipants(instanceId: string, groupId: string, participants: string[]): Promise<void>;
    removeParticipants(instanceId: string, groupId: string, participants: string[]): Promise<void>;
    promoteParticipants(instanceId: string, groupId: string, participants: string[]): Promise<void>;
    demoteParticipants(instanceId: string, groupId: string, participants: string[]): Promise<void>;
    setGroupSubject(instanceId: string, groupId: string, subject: string): Promise<void>;
    setGroupDescription(instanceId: string, groupId: string, description: string): Promise<void>;
    leaveGroup(instanceId: string, groupId: string): Promise<void>;
    getInviteCode(instanceId: string, groupId: string): Promise<string>;
    revokeInviteCode(instanceId: string, groupId: string): Promise<string>;
    joinGroupByInviteCode(instanceId: string, inviteCode: string): Promise<any>;

    // Labels
    getLabels(instanceId: string): Promise<any[]>;
    addLabelToChat(instanceId: string, chatId: string, labelId: string): Promise<void>;
    removeLabelFromChat(instanceId: string, chatId: string, labelId: string): Promise<void>;

    // Profile
    setProfileName(instanceId: string, name: string): Promise<void>;
    setStatus(instanceId: string, status: string): Promise<void>;
    setProfilePicture(instanceId: string, image: string | Buffer): Promise<void>;
}

// Dynamic import and export using top-level await for guaranteed initialization
export const waManager: IWhatsAppManager = useWhatsmeow
    ? (await import('./whatsapp-bridge.js')).waManager as unknown as IWhatsAppManager
    : (await import('./whatsapp-puppeteer.js')).waManager as unknown as IWhatsAppManager;

console.log(`✅ Using ${useWhatsmeow ? 'whatsmeow (Go)' : 'whatsapp-web.js (Puppeteer)'} backend`);
