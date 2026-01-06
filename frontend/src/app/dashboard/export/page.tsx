'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import {
    Download,
    MessageSquare,
    Loader2,
    FileText,
    Hash,
    RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Instance {
    id: string;
    name: string;
    status: string;
    token: string;
    waNumber?: string;
}

interface Chat {
    id: string;
    name: string;
    isGroup: boolean;
    unreadCount: number;
    lastMessage?: {
        body: string;
        timestamp: number;
    };
}

export default function ExportPage() {
    const [instances, setInstances] = useState<Instance[]>([]);
    const [selectedInstance, setSelectedInstance] = useState<string>('');
    const [messageCount, setMessageCount] = useState<number>(50);
    const [loading, setLoading] = useState(false);
    const [loadingInstances, setLoadingInstances] = useState(true);
    const [chats, setChats] = useState<Chat[]>([]);
    const [loadingChats, setLoadingChats] = useState(false);
    const [selectedChats, setSelectedChats] = useState<Set<string>>(new Set());
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        loadInstances();
    }, []);

    const loadInstances = async () => {
        try {
            setLoadingInstances(true);
            const response = await api.getInstances();
            if (response.success) {
                // Show all instances, not just connected ones
                const allInstances: Instance[] = Array.isArray(response.data) ? response.data : [];
                setInstances(allInstances);
                if (allInstances.length > 0) {
                    // Prefer connected instances, but allow any
                    const connectedInstance = allInstances.find((i: Instance) =>
                        i.status?.toLowerCase() === 'connected'
                    );
                    setSelectedInstance(connectedInstance?.id || allInstances[0].id);
                }
            }
        } catch (error) {
            toast.error('Erro ao carregar instâncias');
        } finally {
            setLoadingInstances(false);
        }
    };

    const loadChats = async () => {
        if (!selectedInstance) {
            toast.error('Selecione uma instância primeiro');
            return;
        }

        try {
            setLoadingChats(true);
            const instance = instances.find(i => i.id === selectedInstance);
            if (!instance) {
                toast.error('Instância não encontrada');
                return;
            }

            if (!instance.token) {
                toast.error('Token da instância não encontrado');
                return;
            }

            console.log('Loading chats for instance:', instance.id, 'token:', instance.token);

            const response = await fetch(`/chats/search`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Instance-Token': instance.token,
                },
                body: JSON.stringify({ page: 1, limit: 100, filter: 'all' }),
            });

            const data = await response.json();
            console.log('Chats response:', data);

            if (!response.ok) {
                throw new Error(data.message || `Erro ${response.status}`);
            }

            if (data.success) {
                // Handle different response formats
                const chatsList = data.data?.chats || data.data || [];
                console.log('Loaded chats:', chatsList.length);
                setChats(Array.isArray(chatsList) ? chatsList : []);

                if (chatsList.length === 0) {
                    toast('Nenhuma conversa encontrada', { icon: 'ℹ️' });
                } else {
                    toast.success(`${chatsList.length} conversas carregadas!`);
                }
            } else {
                throw new Error(data.message || 'Erro ao carregar conversas');
            }
        } catch (error: any) {
            console.error('Error loading chats:', error);
            toast.error(error.message || 'Erro ao carregar conversas');
        } finally {
            setLoadingChats(false);
        }
    };

    const toggleChatSelection = (chatId: string) => {
        const newSelection = new Set(selectedChats);
        if (newSelection.has(chatId)) {
            newSelection.delete(chatId);
        } else {
            newSelection.add(chatId);
        }
        setSelectedChats(newSelection);
    };

    const selectAllChats = () => {
        if (selectedChats.size === chats.length) {
            setSelectedChats(new Set());
        } else {
            setSelectedChats(new Set(chats.map(c => c.id)));
        }
    };

    const exportMessages = async () => {
        if (!selectedInstance) {
            toast.error('Selecione uma instância');
            return;
        }

        // Safety check - ensure chats is an array
        if (!Array.isArray(chats) || chats.length === 0) {
            toast.error('Carregue as conversas antes de exportar');
            return;
        }

        if (selectedChats.size === 0) {
            toast.error('Selecione pelo menos uma conversa');
            return;
        }

        setExporting(true);
        try {
            const instance = instances.find(i => i.id === selectedInstance);
            if (!instance) throw new Error('Instância não encontrada');

            const allMessages: any[] = [];
            const chatsToExport = Array.from(selectedChats)
                .map(chatId => chats.find(c => c.id === chatId))
                .filter(Boolean) as Chat[];

            for (const chat of chatsToExport) {
                try {
                    const response = await fetch(`/message/search`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Instance-Token': instance.token,
                        },
                        body: JSON.stringify({
                            chatId: chat.id,
                            limit: messageCount,
                        }),
                    });

                    const data = await response.json();
                    if (data.success && data.data) {
                        allMessages.push({
                            chatId: chat.id,
                            chatName: chat.name,
                            isGroup: chat.isGroup,
                            messages: data.data,
                        });
                    }
                } catch (e) {
                    console.error(`Error fetching messages for chat ${chat.id}:`, e);
                }
            }

            // Helper to format timestamp
            const formatTime = (ts: number) => {
                const date = new Date(ts * 1000);
                return date.toLocaleString('pt-BR', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                });
            };

            // Helper to extract phone number
            const extractPhone = (id: string) => {
                return id.replace('@c.us', '').replace('@g.us', '');
            };

            // Generate clean text format
            let exportText = `╔══════════════════════════════════════════════════════════════════╗
║                    EXPORTAÇÃO WHATSAPP                           ║
║                    ${new Date().toLocaleString('pt-BR')}                        ║
╚══════════════════════════════════════════════════════════════════╝

Instância: ${instance.name} (${instance.waNumber || 'N/A'})
Total de conversas: ${allMessages.length}
Mensagens por conversa: ${messageCount}

`;

            for (const conv of allMessages) {
                const phone = extractPhone(conv.chatId);
                exportText += `
════════════════════════════════════════════════════════════════════
📱 ${conv.chatName || phone}
📞 ${phone}
${conv.isGroup ? '👥 Grupo' : '👤 Contato'}
════════════════════════════════════════════════════════════════════
`;

                // Sort messages by timestamp (oldest first)
                const sortedMessages = [...(conv.messages || [])].sort((a: any, b: any) => a.timestamp - b.timestamp);

                for (const msg of sortedMessages) {
                    const time = formatTime(msg.timestamp);
                    const sender = msg.fromMe ? '← EU' : `→ ${extractPhone(msg.from)}`;
                    const content = msg.body || (msg.hasMedia ? '[Mídia]' : '[Mensagem vazia]');

                    exportText += `[${time}] ${sender}
${content}
---
`;
                }
            }

            exportText += `
══════════════════════════════════════════════════════════════════
                        FIM DA EXPORTAÇÃO
══════════════════════════════════════════════════════════════════
`;

            const blob = new Blob([exportText], {
                type: 'text/plain;charset=utf-8',
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `whatsapp-export-${instance.name}-${new Date().toISOString().split('T')[0]}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            toast.success(`Exportadas ${allMessages.length} conversas!`);
        } catch (error: any) {
            console.error('Export error:', error);
            toast.error(error.message || 'Erro ao exportar');
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="p-8 max-w-4xl mx-auto space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-[var(--foreground)]">
                        Exportar Conversas
                    </h2>
                    <p className="text-[var(--muted-foreground)] mt-1">
                        Exporte mensagens das suas instâncias conectadas
                    </p>
                </div>
            </div>

            <div className="card p-6 space-y-6">
                {/* Instance Selection */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-[var(--foreground)]">
                        Instância
                    </label>
                    {loadingInstances ? (
                        <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Carregando instâncias...
                        </div>
                    ) : instances.length === 0 ? (
                        <p className="text-[var(--muted-foreground)]">
                            Nenhuma instância encontrada. Crie uma instância primeiro.
                        </p>
                    ) : (
                        <select
                            value={selectedInstance}
                            onChange={(e) => {
                                setSelectedInstance(e.target.value);
                                setChats([]);
                                setSelectedChats(new Set());
                            }}
                            className="w-full px-4 py-2.5 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                        >
                            {instances.map((instance) => (
                                <option key={instance.id} value={instance.id}>
                                    {instance.name} {instance.waNumber ? `(${instance.waNumber})` : ''} - {instance.status}
                                </option>
                            ))}
                        </select>
                    )}
                </div>

                {/* Message Count */}
                <div className="space-y-2">
                    <label className="text-sm font-medium text-[var(--foreground)] flex items-center gap-2">
                        <Hash className="w-4 h-4" />
                        Quantidade de mensagens por conversa
                    </label>
                    <div className="flex gap-2">
                        {[10, 50, 100, 200, 500].map((count) => (
                            <button
                                key={count}
                                onClick={() => setMessageCount(count)}
                                className={`px-4 py-2 rounded-lg border transition-colors ${messageCount === count
                                    ? 'bg-[var(--primary)] text-white border-[var(--primary)]'
                                    : 'bg-[var(--background)] border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)]'
                                    }`}
                            >
                                {count}
                            </button>
                        ))}
                    </div>
                    <input
                        type="number"
                        value={messageCount}
                        onChange={(e) => setMessageCount(Math.max(1, parseInt(e.target.value) || 1))}
                        min="1"
                        max="1000"
                        className="w-full px-4 py-2.5 rounded-lg bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                        placeholder="Ou digite um valor customizado..."
                    />
                </div>

                {/* Load Chats Button */}
                <button
                    onClick={loadChats}
                    disabled={!selectedInstance || loadingChats}
                    className="btn btn-secondary w-full flex items-center justify-center gap-2"
                >
                    {loadingChats ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <RefreshCw className="w-4 h-4" />
                    )}
                    Carregar Conversas
                </button>

                {/* Chats List */}
                {chats.length > 0 && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-[var(--foreground)] flex items-center gap-2">
                                <MessageSquare className="w-4 h-4" />
                                Conversas ({chats.length})
                            </label>
                            <button
                                onClick={selectAllChats}
                                className="text-sm text-[var(--primary)] hover:underline"
                            >
                                {selectedChats.size === chats.length ? 'Desmarcar todas' : 'Selecionar todas'}
                            </button>
                        </div>
                        <div className="max-h-60 overflow-y-auto space-y-1 border border-[var(--border)] rounded-lg p-2">
                            {chats.map((chat) => (
                                <label
                                    key={chat.id}
                                    className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${selectedChats.has(chat.id)
                                        ? 'bg-[var(--primary)]/10'
                                        : 'hover:bg-[var(--accent)]'
                                        }`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={selectedChats.has(chat.id)}
                                        onChange={() => toggleChatSelection(chat.id)}
                                        className="w-4 h-4 rounded border-[var(--border)] text-[var(--primary)] focus:ring-[var(--primary)]"
                                    />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">
                                            {chat.name || chat.id}
                                        </p>
                                        {chat.lastMessage && (
                                            <p className="text-xs text-[var(--muted-foreground)] truncate">
                                                {chat.lastMessage.body}
                                            </p>
                                        )}
                                    </div>
                                    {chat.isGroup && (
                                        <span className="text-xs bg-[var(--secondary)] text-[var(--muted-foreground)] px-2 py-0.5 rounded">
                                            Grupo
                                        </span>
                                    )}
                                </label>
                            ))}
                        </div>
                        <p className="text-xs text-[var(--muted-foreground)]">
                            {selectedChats.size} conversa(s) selecionada(s)
                        </p>
                    </div>
                )}

                {/* Export Button */}
                <button
                    onClick={exportMessages}
                    disabled={!selectedInstance || exporting}
                    className="btn btn-primary w-full flex items-center justify-center gap-2 py-3 text-lg"
                >
                    {exporting ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Exportando...
                        </>
                    ) : (
                        <>
                            <Download className="w-5 h-5" />
                            Exportar Mensagens
                        </>
                    )}
                </button>

                <p className="text-xs text-center text-[var(--muted-foreground)]">
                    O arquivo será baixado em formato JSON com todas as mensagens
                </p>
            </div>
        </div>
    );
}
