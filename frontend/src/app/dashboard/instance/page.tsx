'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import Link from 'next/link';
import {
    ArrowLeft,
    Loader2,
    Wifi,
    WifiOff,
    RefreshCw,
    Copy,
    Check,
    MessageSquare,
    Settings,
    Power,
    QrCode,
    Send,
    PlayCircle,
    MapPin,
    ListChecks,
    Activity,
    Edit as EditIcon,
    Smile,
    Image as ImageIcon,
    Trash2,
    Plus,
    X,
    ToggleLeft,
    ToggleRight,
    Phone,
    Bell,
    Eye,
    History,
    Users,
    Globe,
    Save
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Instance {
    id: string;
    name: string;
    token: string;
    status: string;
    waNumber?: string;
    waName?: string;
    waPicture?: string;
    webhookUrl?: string;
    webhookEvents: string[];
    qrCode?: string;
    createdAt: string;
    updatedAt: string;
}

interface InstanceSettings {
    alwaysOnline: boolean;
    ignoreGroups: boolean;
    rejectCalls: boolean;
    readMessages: boolean;
    syncFullHistory: boolean;
}

interface ProxyConfig {
    proxyHost: string | null;
    proxyPort: string | null;
    proxyUsername: string | null;
    proxyPasswordSet: boolean;
    proxyProtocol: 'http' | 'https' | 'socks4' | 'socks5' | null;
}

type MessageType = 'text' | 'media' | 'poll' | 'location' | 'presence' | 'edit' | 'react' | 'delete';

function InstanceDetailContent() {
    const searchParams = useSearchParams();
    const id = searchParams.get('id') as string;
    const { user, checkAuth } = useAuth();
    const router = useRouter();
    const [instance, setInstance] = useState<Instance | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [connecting, setConnecting] = useState(false);
    const [copied, setCopied] = useState(false);
    const [activeTab, setActiveTab] = useState<'overview' | 'test' | 'settings'>('overview');

    // Connection Method State
    const [connectionMethod, setConnectionMethod] = useState<'qr' | 'code'>('qr');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [pairingCode, setPairingCode] = useState('');

    // Settings State
    const [settings, setSettings] = useState<InstanceSettings>({
        alwaysOnline: false,
        ignoreGroups: false,
        rejectCalls: false,
        readMessages: false,
        syncFullHistory: false,
    });
    const [savingSettings, setSavingSettings] = useState(false);

    // Webhook State
    const [webhookUrl, setWebhookUrl] = useState('');
    const [webhookEvents, setWebhookEvents] = useState<string[]>([]);
    const [savingWebhook, setSavingWebhook] = useState(false);

    // Proxy State
    const [proxyHost, setProxyHost] = useState('');
    const [proxyPort, setProxyPort] = useState('');
    const [proxyUsername, setProxyUsername] = useState('');
    const [proxyPassword, setProxyPassword] = useState('');
    const [proxyProtocol, setProxyProtocol] = useState<'http' | 'https' | 'socks4' | 'socks5'>('http');
    const [proxyPasswordSet, setProxyPasswordSet] = useState(false);
    const [savingProxy, setSavingProxy] = useState(false);
    const [proxyEnabled, setProxyEnabled] = useState(false);

    // Test Form States
    const [messageType, setMessageType] = useState<MessageType>('text');
    const [testTo, setTestTo] = useState('');
    const [sending, setSending] = useState(false);

    // Specific Fields
    const [textMessage, setTextMessage] = useState('');
    const [mediaUrl, setMediaUrl] = useState('');
    const [mediaCaption, setMediaCaption] = useState('');
    const [latitude, setLatitude] = useState('');
    const [longitude, setLongitude] = useState('');
    const [locationDesc, setLocationDesc] = useState('');
    const [presenceType, setPresenceType] = useState('composing');
    const [pollTitle, setPollTitle] = useState('');
    const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
    const [allowMultipleAnswers, setAllowMultipleAnswers] = useState(false);
    const [targetMessageId, setTargetMessageId] = useState('');
    const [reactionEmoji, setReactionEmoji] = useState('');

    useEffect(() => {
        checkAuth();
    }, []);

    useEffect(() => {
        if (id) {
            loadInstance();
            loadSettings();
            loadWebhook();
            loadProxy();
        }
    }, [id]);

    const loadInstance = async () => {
        try {
            const response = await api.getInstance(id);
            if (response.data) {
                setInstance(response.data as Instance);
            }
        } catch (error) {
            toast.error('Erro ao carregar instância');
            router.push('/dashboard');
        } finally {
            setIsLoading(false);
        }
    };

    const loadSettings = async () => {
        try {
            const response = await api.getInstanceSettings(id);
            if (response.data) {
                setSettings(response.data as InstanceSettings);
            }
        } catch (error) {
            console.error('Failed to load settings', error);
        }
    };

    const toggleSetting = async (key: keyof InstanceSettings) => {
        const newValue = !settings[key];
        const previousSettings = { ...settings };

        // Optimistic update
        setSettings(prev => ({ ...prev, [key]: newValue }));
        setSavingSettings(true);

        try {
            await api.updateInstanceSettings(id, { [key]: newValue });
            toast.success('Configuração atualizada');
        } catch (error) {
            // Rollback on error
            setSettings(previousSettings);
            toast.error('Erro ao atualizar configuração');
        } finally {
            setSavingSettings(false);
        }
    };

    const loadWebhook = async () => {
        try {
            const response = await api.getInstance(id);
            if (response.data) {
                const data = response.data as any;
                setWebhookUrl(data.webhookUrl || '');
                setWebhookEvents(data.webhookEvents || []);
            }
        } catch (error) {
            console.error('Failed to load webhook config', error);
        }
    };

    const saveWebhook = async () => {
        setSavingWebhook(true);
        try {
            await api.updateInstanceWebhook(id, webhookUrl || null, webhookEvents);
            toast.success('Webhook configurado!');
        } catch (error) {
            toast.error('Erro ao salvar webhook');
        } finally {
            setSavingWebhook(false);
        }
    };

    const loadProxy = async () => {
        try {
            const response = await api.getInstanceProxy(id);
            if (response.data) {
                const data = response.data as any;
                setProxyHost(data.proxyHost || '');
                setProxyPort(data.proxyPort || '');
                setProxyUsername(data.proxyUsername || '');
                setProxyPasswordSet(data.proxyPasswordSet || false);
                setProxyProtocol(data.proxyProtocol || 'http');
                setProxyEnabled(!!(data.proxyHost && data.proxyPort));
            }
        } catch (error) {
            console.error('Failed to load proxy config', error);
        }
    };

    const saveProxy = async () => {
        setSavingProxy(true);
        try {
            if (proxyEnabled && proxyHost && proxyPort) {
                await api.updateInstanceProxy(id, {
                    proxyHost,
                    proxyPort,
                    proxyUsername: proxyUsername || null,
                    proxyPassword: proxyPassword || null,
                    proxyProtocol,
                });
            } else {
                // Disable proxy by clearing all fields
                await api.updateInstanceProxy(id, {
                    proxyHost: null,
                    proxyPort: null,
                    proxyUsername: null,
                    proxyPassword: null,
                    proxyProtocol: null,
                });
            }
            toast.success('Configuração de proxy salva!');
            setProxyPassword(''); // Clear password field after save
            loadProxy(); // Reload to update proxyPasswordSet
        } catch (error) {
            toast.error('Erro ao salvar proxy');
        } finally {
            setSavingProxy(false);
        }
    };

    const toggleWebhookEvent = (event: string) => {
        setWebhookEvents(prev =>
            prev.includes(event)
                ? prev.filter(e => e !== event)
                : [...prev, event]
        );
    };

    const handleConnect = async () => {
        setConnecting(true);
        setPairingCode('');
        try {
            if (connectionMethod === 'code') {
                // Connect with pairing code
                if (!phoneNumber.trim()) {
                    toast.error('Digite o número de telefone');
                    setConnecting(false);
                    return;
                }
                const response = await api.connectWithPairingCode(id, phoneNumber);
                if (response.data?.pairingCode) {
                    setPairingCode(response.data.pairingCode);
                    toast.success('Código gerado! Digite-o no WhatsApp');
                }
            } else {
                // Connect with QR code
                await api.connectInstance(id);
                toast.success('Conectando... Escaneie o QR Code');
            }
            loadInstance();

            // Start polling for status
            const poll = setInterval(async () => {
                const statusRes = await api.getInstanceStatus(id);
                if (statusRes.data) {
                    const statusData = statusRes.data as Partial<Instance>;
                    setInstance((prev: Instance | null) => prev ? { ...prev, ...statusData } : prev);
                    if (statusData.status === 'connected') {
                        clearInterval(poll);
                        toast.success('Conectado com sucesso!');
                        setPairingCode('');
                    }
                }
            }, 3000);

            // Stop polling after 2 minutes
            setTimeout(() => clearInterval(poll), 120000);
        } catch (error: any) {
            toast.error(error.message || 'Erro ao conectar');
        } finally {
            setConnecting(false);
        }
    };

    const handleDisconnect = async () => {
        try {
            await api.disconnectInstance(id);
            toast.success('Desconectado');
            loadInstance();
        } catch (error: any) {
            toast.error(error.message || 'Erro ao desconectar');
        }
    };

    const handleLogout = async () => {
        if (!confirm('Isso removerá a sessão. Você precisará escanear o QR novamente.')) return;

        try {
            await api.logoutInstance(id);
            toast.success('Sessão encerrada');
            loadInstance();
        } catch (error: any) {
            toast.error(error.message || 'Erro ao fazer logout');
        }
    };

    const handleAddPollOption = () => {
        if (pollOptions.length < 12) {
            setPollOptions([...pollOptions, '']);
        }
    };

    const handleRemovePollOption = (index: number) => {
        if (pollOptions.length > 2) {
            const newOptions = [...pollOptions];
            newOptions.splice(index, 1);
            setPollOptions(newOptions);
        }
    };

    const handlePollOptionChange = (index: number, value: string) => {
        const newOptions = [...pollOptions];
        newOptions[index] = value;
        setPollOptions(newOptions);
    };

    const handleSendMessage = async () => {
        // Validation common fields
        if (!['edit', 'react', 'delete'].includes(messageType) && !testTo) {
            toast.error('Preencha o número do destinatário');
            return;
        }

        if (['edit', 'react', 'delete'].includes(messageType) && !targetMessageId) {
            toast.error('Preencha o ID da mensagem');
            return;
        }

        setSending(true);
        try {
            // Use relative URL since frontend is served from same domain as API
            const baseUrl = process.env.NEXT_PUBLIC_API_URL || '';
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${instance?.token || ''}`,
                'X-Instance-Token': instance?.token || '',
            };

            let endpoint = '';
            let body: any = {};

            switch (messageType) {
                case 'text':
                    endpoint = '/message/text';
                    body = { to: testTo, text: textMessage };
                    if (!textMessage) throw new Error('Digite a mensagem');
                    break;
                case 'media':
                    endpoint = '/message/media';
                    body = { to: testTo, mediaUrl, caption: mediaCaption };
                    if (!mediaUrl) throw new Error('Insira a URL da mídia');
                    break;
                case 'poll':
                    endpoint = '/message/poll';
                    const validOptions = pollOptions.filter(o => o.trim().length > 0);
                    if (validOptions.length < 2) throw new Error('Mínimo de 2 opções');
                    body = {
                        to: testTo,
                        title: pollTitle,
                        options: validOptions,
                        allowMultipleAnswers
                    };
                    if (!pollTitle) throw new Error('Digite o título da enquete');
                    break;
                case 'location':
                    endpoint = '/message/location';
                    body = {
                        to: testTo,
                        latitude: parseFloat(latitude),
                        longitude: parseFloat(longitude),
                        description: locationDesc
                    };
                    if (!latitude || !longitude) throw new Error('Coordenadas inválidas');
                    break;
                case 'presence':
                    endpoint = '/message/presence';
                    body = { to: testTo, presence: presenceType };
                    break;
                case 'edit':
                    endpoint = '/message/edit';
                    body = { chatId: testTo, messageId: targetMessageId, newText: textMessage };
                    if (!textMessage) throw new Error('Digite o novo texto');
                    if (!testTo) throw new Error('Digite o número do chat');
                    break;
                case 'react':
                    endpoint = '/message/react';
                    body = { chatId: testTo, messageId: targetMessageId, reaction: reactionEmoji };
                    if (!reactionEmoji) throw new Error('Escolha um emoji');
                    if (!testTo) throw new Error('Digite o número do chat');
                    break;
                case 'delete':
                    endpoint = '/message/delete';
                    body = { chatId: testTo, messageId: targetMessageId };
                    if (!testTo) throw new Error('Digite o número do chat');
                    break;
            }

            const res = await fetch(`${baseUrl}${endpoint}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.message || 'Falha ao enviar');

            toast.success('Ação realizada com sucesso!');

            // Auto-fill message ID for subsequent actions
            if (data.data?.id) {
                setTargetMessageId(data.data.id);
                toast('ID da mensagem capturado!', { icon: '📋' });
            }

            // Clear specific fields if needed
            if (messageType === 'text') setTextMessage('');
        } catch (error: any) {
            toast.error(error.message || 'Erro ao realizar ação');
        } finally {
            setSending(false);
        }
    };

    const copyToken = () => {
        if (instance?.token) {
            navigator.clipboard.writeText(instance.token);
            setCopied(true);
            toast.success('Token copiado!');
            setTimeout(() => setCopied(false), 2000);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
            </div>
        );
    }

    if (!instance) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p>Instância não encontrada</p>
            </div>
        );
    }

    const isConnected = instance.status === 'connected';
    const isConnecting = instance.status === 'connecting' || instance.status === 'qr';

    return (
        <div className="min-h-screen p-8">
            <div className="max-w-5xl mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center gap-4 mb-8">
                    <div className="flex items-center gap-4 flex-1">
                        <Link
                            href="/dashboard"
                            className="p-2 rounded-lg hover:bg-[var(--card)] transition-colors"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-2xl font-bold">{instance.name}</h1>
                                <span
                                    className={`px-2 py-1 rounded-full text-xs font-medium ${isConnected
                                        ? 'bg-[var(--success)]/20 text-[var(--success)]'
                                        : isConnecting
                                            ? 'bg-[var(--warning)]/20 text-[var(--warning)]'
                                            : 'bg-[var(--danger)]/20 text-[var(--danger)]'
                                        }`}
                                >
                                    {instance.status === 'qr' ? 'Aguardando QR' : instance.status}
                                </span>
                            </div>
                            <p className="text-[var(--muted)]">
                                {instance.waNumber ? `+${instance.waNumber}` : 'Não conectado'}
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={loadInstance} className="btn btn-secondary">
                            <RefreshCw className="w-4 h-4" />
                            Atualizar
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-4 border-b border-[var(--border)] mb-6">
                    <button
                        onClick={() => setActiveTab('overview')}
                        className={`pb-3 px-2 text-sm font-medium transition-colors relative ${activeTab === 'overview'
                            ? 'text-[var(--primary)]'
                            : 'text-[var(--muted)] hover:text-[var(--foreground)]'
                            }`}
                    >
                        Visão Geral
                        {activeTab === 'overview' && (
                            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[var(--primary)] rounded-t-full" />
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('test')}
                        className={`pb-3 px-2 text-sm font-medium transition-colors relative ${activeTab === 'test'
                            ? 'text-[var(--primary)]'
                            : 'text-[var(--muted)] hover:text-[var(--foreground)]'
                            }`}
                    >
                        Testar Envio
                        {activeTab === 'test' && (
                            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[var(--primary)] rounded-t-full" />
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('settings')}
                        className={`pb-3 px-2 text-sm font-medium transition-colors relative ${activeTab === 'settings'
                            ? 'text-[var(--primary)]'
                            : 'text-[var(--muted)] hover:text-[var(--foreground)]'
                            }`}
                    >
                        Configurações
                        {activeTab === 'settings' && (
                            <div className="absolute bottom-0 left-0 w-full h-0.5 bg-[var(--primary)] rounded-t-full" />
                        )}
                    </button>
                </div>

                {activeTab === 'overview' ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in">
                        {/* Connection Card */}
                        <div className="card p-6">
                            <h3 className="font-semibold mb-4 flex items-center gap-2">
                                <QrCode className="w-5 h-5" />
                                Conexão WhatsApp
                            </h3>

                            {isConnected ? (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-4 p-4 bg-[var(--success)]/10 rounded-lg">
                                        <div className="w-12 h-12 rounded-full bg-[var(--success)]/20 flex items-center justify-center">
                                            <Wifi className="w-6 h-6 text-[var(--success)]" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-[var(--success)]">Conectado</p>
                                            <p className="text-sm text-[var(--muted)]">
                                                {instance.waName} • +{instance.waNumber}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex gap-3">
                                        <button onClick={handleDisconnect} className="btn btn-secondary flex-1">
                                            <WifiOff className="w-4 h-4 mr-2" />
                                            Desconectar
                                        </button>
                                        <button onClick={handleLogout} className="btn btn-danger flex-1">
                                            <Power className="w-4 h-4 mr-2" />
                                            Logout
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {/* Connection Method Toggle */}
                                    <div className="flex gap-2 p-1 bg-[var(--background)] rounded-lg border border-[var(--border)]">
                                        <button
                                            onClick={() => { setConnectionMethod('qr'); setPairingCode(''); }}
                                            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${connectionMethod === 'qr'
                                                ? 'bg-[var(--primary)] text-white'
                                                : 'text-[var(--muted)] hover:text-[var(--foreground)]'
                                                }`}
                                        >
                                            QR Code
                                        </button>
                                        <button
                                            onClick={() => { setConnectionMethod('code'); }}
                                            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${connectionMethod === 'code'
                                                ? 'bg-[var(--primary)] text-white'
                                                : 'text-[var(--muted)] hover:text-[var(--foreground)]'
                                                }`}
                                        >
                                            Código
                                        </button>
                                    </div>

                                    {connectionMethod === 'qr' ? (
                                        /* QR Code Display */
                                        instance.qrCode ? (
                                            <div className="bg-white p-4 rounded-lg">
                                                <img
                                                    src={instance.qrCode}
                                                    alt="QR Code"
                                                    className="w-full max-w-xs mx-auto mix-blend-multiply"
                                                />
                                            </div>
                                        ) : (
                                            <div className="p-8 text-center bg-[var(--background)] rounded-lg border border-dashed border-[var(--border)]">
                                                <WifiOff className="w-12 h-12 mx-auto mb-4 text-[var(--muted)]" />
                                                <p className="text-[var(--muted)]">
                                                    Clique em conectar para gerar o QR Code
                                                </p>
                                            </div>
                                        )
                                    ) : (
                                        /* Pairing Code Method */
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium mb-2">
                                                    Número de Telefone (com DDI)
                                                </label>
                                                <input
                                                    type="tel"
                                                    placeholder="5511999999999"
                                                    value={phoneNumber}
                                                    onChange={(e) => setPhoneNumber(e.target.value)}
                                                    className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2"
                                                />
                                            </div>

                                            {pairingCode && (
                                                <div className="p-6 bg-[var(--primary)]/10 rounded-lg text-center">
                                                    <p className="text-sm text-[var(--muted)] mb-2">
                                                        Digite este código no WhatsApp:
                                                    </p>
                                                    <p className="text-4xl font-bold tracking-widest text-[var(--primary)]">
                                                        {pairingCode}
                                                    </p>
                                                    <p className="text-xs text-[var(--muted)] mt-3">
                                                        WhatsApp &gt; Configurações &gt; Aparelhos conectados &gt; Vincular por número
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <button
                                        onClick={handleConnect}
                                        disabled={connecting}
                                        className="btn btn-primary w-full"
                                    >
                                        {connecting ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                                Conectando...
                                            </>
                                        ) : (
                                            <>
                                                <Wifi className="w-4 h-4 mr-2" />
                                                {connectionMethod === 'code' ? 'Gerar Código' : 'Conectar'}
                                            </>
                                        )}
                                    </button>

                                    {connectionMethod === 'qr' && instance.qrCode && (
                                        <p className="text-center text-xs text-[var(--muted)]">
                                            Abra o WhatsApp &gt; Aparelhos conectados &gt; Conectar aparelho
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* API Token Card */}
                        <div className="card p-6">
                            <h3 className="font-semibold mb-4 flex items-center gap-2">
                                <Settings className="w-5 h-5" />
                                Token da API
                            </h3>

                            <p className="text-sm text-[var(--muted)] mb-4">
                                Use este token para autenticar requisições à API
                            </p>

                            <div className="flex items-center gap-2 mb-4">
                                <input
                                    type="text"
                                    value={instance.token}
                                    readOnly
                                    className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 font-mono text-sm"
                                />
                                <button
                                    onClick={copyToken}
                                    className="btn btn-secondary shrink-0"
                                >
                                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                                </button>
                            </div>

                            <div className="p-4 bg-[var(--background)] rounded-lg border border-[var(--border)]">
                                <p className="text-xs text-[var(--muted)] mb-2">Exemplo de uso:</p>
                                <code className="text-xs text-[var(--primary)] break-all font-mono">
                                    curl -X POST {typeof window !== 'undefined' ? window.location.origin : ''}/message/text \<br />
                                    &nbsp;&nbsp;-H "X-Instance-Token: {instance.token.substring(0, 8)}..." \<br />
                                    &nbsp;&nbsp;-d '{`{"to":"5511999999999","text":"Olá!"}`}'
                                </code>
                            </div>
                        </div>

                        {/* Info Card */}
                        <div className="card p-6 lg:col-span-2">
                            <h3 className="font-semibold mb-4 flex items-center gap-2">
                                <MessageSquare className="w-5 h-5" />
                                Informações
                            </h3>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div>
                                    <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">ID</p>
                                    <p className="font-mono text-sm truncate">{instance.id}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">Nome</p>
                                    <p className="font-medium">{instance.name}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">Criado em</p>
                                    <p className="font-medium">
                                        {new Date(instance.createdAt).toLocaleDateString('pt-BR')}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">Atualizado em</p>
                                    <p className="font-medium">
                                        {new Date(instance.updatedAt).toLocaleDateString('pt-BR')}
                                    </p>
                                </div>
                            </div>

                            {instance.webhookUrl && (
                                <div className="mt-4 pt-4 border-t border-[var(--border)]">
                                    <p className="text-xs text-[var(--muted)] uppercase tracking-wider mb-1">Webhook URL</p>
                                    <p className="font-mono text-sm">{instance.webhookUrl}</p>
                                </div>
                            )}
                        </div>
                    </div>
                ) : activeTab === 'test' ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in">
                        <div className="card p-6 md:col-span-2">
                            <h3 className="font-semibold mb-6 flex items-center gap-2">
                                <PlayCircle className="w-5 h-5 text-[var(--primary)]" />
                                Playground de Teste
                            </h3>

                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
                                {[
                                    { id: 'text', label: 'Texto', icon: MessageSquare },
                                    { id: 'media', label: 'Mídia', icon: ImageIcon },
                                    { id: 'poll', label: 'Enquete', icon: ListChecks },
                                    { id: 'location', label: 'Local', icon: MapPin },
                                    { id: 'presence', label: 'Presença', icon: Activity },
                                    { id: 'edit', label: 'Editar', icon: EditIcon },
                                    { id: 'react', label: 'Reagir', icon: Smile },
                                    { id: 'delete', label: 'Apagar', icon: Trash2 },
                                ].map((type) => (
                                    <button
                                        key={type.id}
                                        onClick={() => setMessageType(type.id as MessageType)}
                                        className={`flex flex-col items-center justify-center p-3 rounded-lg border transition-all ${messageType === type.id
                                            ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                                            : 'border-[var(--border)] hover:bg-[var(--card)] hover:border-[var(--primary)]/50'
                                            }`}
                                    >
                                        <type.icon className="w-5 h-5 mb-1" />
                                        <span className="text-xs font-medium">{type.label}</span>
                                    </button>
                                ))}
                            </div>

                            <div className="space-y-4">
                                {!['edit', 'react', 'delete'].includes(messageType) ? (
                                    <div>
                                        <label className="block text-sm font-medium mb-2">Destinatário (WhatsApp)</label>
                                        <input
                                            type="text"
                                            placeholder="5511999999999"
                                            value={testTo}
                                            onChange={(e) => setTestTo(e.target.value)}
                                            className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                                        />
                                        <p className="text-xs text-[var(--muted)] mt-1">
                                            Formato internacional sem símbolos (ex: 5511999999999)
                                        </p>
                                    </div>
                                ) : (
                                    <div>
                                        <label className="block text-sm font-medium mb-2">ID da Mensagem</label>
                                        <input
                                            type="text"
                                            placeholder="false_5511999999999@c.us_3EB0..."
                                            value={targetMessageId}
                                            onChange={(e) => setTargetMessageId(e.target.value)}
                                            className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                                        />
                                    </div>
                                )}

                                {messageType === 'text' && (
                                    <div>
                                        <label className="block text-sm font-medium mb-2">Mensagem</label>
                                        <textarea
                                            rows={4}
                                            placeholder="Digite sua mensagem..."
                                            value={textMessage}
                                            onChange={(e) => setTextMessage(e.target.value)}
                                            className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                                        />
                                    </div>
                                )}

                                {messageType === 'media' && (
                                    <>
                                        <div>
                                            <label className="block text-sm font-medium mb-2">URL da Mídia</label>
                                            <input
                                                type="text"
                                                placeholder="https://exemplo.com/imagem.jpg"
                                                value={mediaUrl}
                                                onChange={(e) => setMediaUrl(e.target.value)}
                                                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium mb-2">Legenda (Opcional)</label>
                                            <input
                                                type="text"
                                                placeholder="Legenda da mídia"
                                                value={mediaCaption}
                                                onChange={(e) => setMediaCaption(e.target.value)}
                                                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                                            />
                                        </div>
                                    </>
                                )}

                                {messageType === 'poll' && (
                                    <div className="space-y-3">
                                        <div>
                                            <label className="block text-sm font-medium mb-2">Título da Enquete</label>
                                            <input
                                                type="text"
                                                placeholder="Qual sua cor favorita?"
                                                value={pollTitle}
                                                onChange={(e) => setPollTitle(e.target.value)}
                                                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium mb-2">Opções</label>
                                            <div className="space-y-2">
                                                {pollOptions.map((option, idx) => (
                                                    <div key={idx} className="flex gap-2">
                                                        <input
                                                            type="text"
                                                            placeholder={`Opção ${idx + 1}`}
                                                            value={option}
                                                            onChange={(e) => handlePollOptionChange(idx, e.target.value)}
                                                            className="flex-1 bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                                                        />
                                                        {pollOptions.length > 2 && (
                                                            <button
                                                                onClick={() => handleRemovePollOption(idx)}
                                                                className="p-2 text-[var(--danger)] hover:bg-[var(--danger)]/10 rounded-lg"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                            {pollOptions.length < 12 && (
                                                <button
                                                    onClick={handleAddPollOption}
                                                    className="mt-2 text-sm text-[var(--primary)] hover:underline flex items-center gap-1"
                                                >
                                                    <Plus className="w-4 h-4" /> Adicionar Opção
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                id="allowMultiple"
                                                checked={allowMultipleAnswers}
                                                onChange={(e) => setAllowMultipleAnswers(e.target.checked)}
                                                className="w-4 h-4 rounded border-[var(--border)] text-[var(--primary)]"
                                            />
                                            <label htmlFor="allowMultiple" className="text-sm">Permitir múltiplas respostas</label>
                                        </div>
                                    </div>
                                )}

                                {messageType === 'location' && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium mb-2">Latitude</label>
                                            <input
                                                type="number"
                                                step="any"
                                                placeholder="-23.550520"
                                                value={latitude}
                                                onChange={(e) => setLatitude(e.target.value)}
                                                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium mb-2">Longitude</label>
                                            <input
                                                type="number"
                                                step="any"
                                                placeholder="-46.633308"
                                                value={longitude}
                                                onChange={(e) => setLongitude(e.target.value)}
                                                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                                            />
                                        </div>
                                        <div className="col-span-2">
                                            <label className="block text-sm font-medium mb-2">Descrição (Opcional)</label>
                                            <input
                                                type="text"
                                                placeholder="Escritório Central"
                                                value={locationDesc}
                                                onChange={(e) => setLocationDesc(e.target.value)}
                                                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                                            />
                                        </div>
                                    </div>
                                )}

                                {messageType === 'presence' && (
                                    <div>
                                        <label className="block text-sm font-medium mb-2">Estado de Presença</label>
                                        <select
                                            value={presenceType}
                                            onChange={(e) => setPresenceType(e.target.value)}
                                            className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                                        >
                                            <option value="composing">Digitando (composing)</option>
                                            <option value="recording">Gravando áudio (recording)</option>
                                            <option value="available">Online (available)</option>
                                            <option value="unavailable">Offline (unavailable)</option>
                                        </select>
                                    </div>
                                )}

                                {messageType === 'edit' && (
                                    <div>
                                        <label className="block text-sm font-medium mb-2">Novo Texto</label>
                                        <textarea
                                            rows={4}
                                            placeholder="Digite o novo texto da mensagem..."
                                            value={textMessage}
                                            onChange={(e) => setTextMessage(e.target.value)}
                                            className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                                        />
                                    </div>
                                )}

                                {messageType === 'react' && (
                                    <div>
                                        <label className="block text-sm font-medium mb-2">Emoji</label>
                                        <input
                                            type="text"
                                            placeholder="👍"
                                            value={reactionEmoji}
                                            onChange={(e) => setReactionEmoji(e.target.value)}
                                            className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--primary)] text-2xl"
                                        />
                                    </div>
                                )}

                                <button
                                    onClick={handleSendMessage}
                                    disabled={sending || !isConnected}
                                    className="btn btn-primary w-full"
                                >
                                    {sending ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                            Enviando...
                                        </>
                                    ) : (
                                        <>
                                            <Send className="w-4 h-4 mr-2" />
                                            Executar Ação
                                        </>
                                    )}
                                </button>

                                {!isConnected && (
                                    <p className="text-center text-sm text-[var(--danger)]">
                                        Conecte a instância para realizar testes.
                                    </p>
                                )}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="card p-6">
                                <h4 className="font-medium mb-4 text-sm">Dicas de Uso</h4>
                                <div className="space-y-4 text-sm text-[var(--muted)]">
                                    <p>
                                        <strong className="text-[var(--foreground)]">Texto & Mídia:</strong>
                                        Envie mensagens diretas para qualquer número. O número deve incluir o código do país (ex: 55).
                                    </p>
                                    <p>
                                        <strong className="text-[var(--foreground)]">Enquetes:</strong>
                                        Crie enquetes interativas. O WhatsApp permite até 12 opções.
                                    </p>
                                    <p>
                                        <strong className="text-[var(--foreground)]">Presença:</strong>
                                        Simule que está digitando ou gravando áudio para dar mais realismo aos bots.
                                    </p>
                                    <p>
                                        <strong className="text-[var(--foreground)]">Edição & Reação:</strong>
                                        Requer o ID da mensagem. Em integrações reais, você armazena o ID retornado ao enviar uma mensagem.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : activeTab === 'settings' ? (
                    <div className="max-w-2xl animate-fade-in">
                        <div className="card p-6">
                            <h3 className="font-semibold mb-6 flex items-center gap-2">
                                <Settings className="w-5 h-5 text-[var(--primary)]" />
                                Configurações de Comportamento
                            </h3>

                            <div className="space-y-4">
                                {/* Always Online */}
                                <div
                                    onClick={() => toggleSetting('alwaysOnline')}
                                    className="flex items-center justify-between p-4 rounded-lg border border-[var(--border)] hover:bg-[var(--card)] cursor-pointer transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
                                            <Bell className="w-5 h-5 text-[var(--primary)]" />
                                        </div>
                                        <div>
                                            <p className="font-medium">Sempre Online</p>
                                            <p className="text-sm text-[var(--muted)]">Mantém o status online 24 horas</p>
                                        </div>
                                    </div>
                                    {settings.alwaysOnline ? (
                                        <ToggleRight className="w-8 h-8 text-[var(--success)]" />
                                    ) : (
                                        <ToggleLeft className="w-8 h-8 text-[var(--muted)]" />
                                    )}
                                </div>

                                {/* Ignore Groups */}
                                <div
                                    onClick={() => toggleSetting('ignoreGroups')}
                                    className="flex items-center justify-between p-4 rounded-lg border border-[var(--border)] hover:bg-[var(--card)] cursor-pointer transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-[var(--warning)]/10 flex items-center justify-center">
                                            <Users className="w-5 h-5 text-[var(--warning)]" />
                                        </div>
                                        <div>
                                            <p className="font-medium">Ignorar Grupos</p>
                                            <p className="text-sm text-[var(--muted)]">Não processa mensagens de grupos</p>
                                        </div>
                                    </div>
                                    {settings.ignoreGroups ? (
                                        <ToggleRight className="w-8 h-8 text-[var(--success)]" />
                                    ) : (
                                        <ToggleLeft className="w-8 h-8 text-[var(--muted)]" />
                                    )}
                                </div>

                                {/* Reject Calls */}
                                <div
                                    onClick={() => toggleSetting('rejectCalls')}
                                    className="flex items-center justify-between p-4 rounded-lg border border-[var(--border)] hover:bg-[var(--card)] cursor-pointer transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-[var(--danger)]/10 flex items-center justify-center">
                                            <Phone className="w-5 h-5 text-[var(--danger)]" />
                                        </div>
                                        <div>
                                            <p className="font-medium">Rejeitar Ligações</p>
                                            <p className="text-sm text-[var(--muted)]">Recusa chamadas automaticamente</p>
                                        </div>
                                    </div>
                                    {settings.rejectCalls ? (
                                        <ToggleRight className="w-8 h-8 text-[var(--success)]" />
                                    ) : (
                                        <ToggleLeft className="w-8 h-8 text-[var(--muted)]" />
                                    )}
                                </div>

                                {/* Read Messages */}
                                <div
                                    onClick={() => toggleSetting('readMessages')}
                                    className="flex items-center justify-between p-4 rounded-lg border border-[var(--border)] hover:bg-[var(--card)] cursor-pointer transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-[var(--success)]/10 flex items-center justify-center">
                                            <Eye className="w-5 h-5 text-[var(--success)]" />
                                        </div>
                                        <div>
                                            <p className="font-medium">Ler Mensagens</p>
                                            <p className="text-sm text-[var(--muted)]">Marca mensagens como lidas automaticamente</p>
                                        </div>
                                    </div>
                                    {settings.readMessages ? (
                                        <ToggleRight className="w-8 h-8 text-[var(--success)]" />
                                    ) : (
                                        <ToggleLeft className="w-8 h-8 text-[var(--muted)]" />
                                    )}
                                </div>

                                {/* Sync Full History */}
                                <div
                                    onClick={() => toggleSetting('syncFullHistory')}
                                    className="flex items-center justify-between p-4 rounded-lg border border-[var(--border)] hover:bg-[var(--card)] cursor-pointer transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                                            <History className="w-5 h-5 text-purple-500" />
                                        </div>
                                        <div>
                                            <p className="font-medium">Sincronizar Histórico</p>
                                            <p className="text-sm text-[var(--muted)]">Sincroniza histórico completo ao conectar</p>
                                        </div>
                                    </div>
                                    {settings.syncFullHistory ? (
                                        <ToggleRight className="w-8 h-8 text-[var(--success)]" />
                                    ) : (
                                        <ToggleLeft className="w-8 h-8 text-[var(--muted)]" />
                                    )}
                                </div>
                            </div>

                            {savingSettings && (
                                <div className="mt-4 flex items-center justify-center gap-2 text-sm text-[var(--muted)]">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Salvando...
                                </div>
                            )}
                        </div>

                        {/* Webhook Configuration Card */}
                        <div className="card p-6 mt-6">
                            <h3 className="font-semibold mb-6 flex items-center gap-2">
                                <Globe className="w-5 h-5 text-[var(--primary)]" />
                                Webhook (Integração com Agente)
                            </h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium mb-2">URL do Webhook</label>
                                    <input
                                        type="url"
                                        placeholder="https://seu-agente.com/webhook"
                                        value={webhookUrl}
                                        onChange={(e) => setWebhookUrl(e.target.value)}
                                        className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                                    />
                                    <p className="text-xs text-[var(--muted)] mt-1">
                                        A API enviará eventos para esta URL via POST
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium mb-2">Eventos</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {[
                                            { id: 'message', label: 'Mensagens Recebidas' },
                                            { id: 'message_create', label: 'Mensagens Criadas' },
                                            { id: 'message_ack', label: 'Confirmação de Leitura' },
                                            { id: 'call', label: 'Ligações' },
                                            { id: 'group_join', label: 'Entrada em Grupo' },
                                            { id: 'group_leave', label: 'Saída de Grupo' },
                                        ].map((event) => (
                                            <label
                                                key={event.id}
                                                className="flex items-center gap-2 p-2 rounded-lg border border-[var(--border)] hover:bg-[var(--card)] cursor-pointer"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={webhookEvents.includes(event.id)}
                                                    onChange={() => toggleWebhookEvent(event.id)}
                                                    className="w-4 h-4 rounded border-[var(--border)] text-[var(--primary)]"
                                                />
                                                <span className="text-sm">{event.label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>

                                <button
                                    onClick={saveWebhook}
                                    disabled={savingWebhook}
                                    className="btn btn-primary w-full"
                                >
                                    {savingWebhook ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                            Salvando...
                                        </>
                                    ) : (
                                        <>
                                            <Save className="w-4 h-4 mr-2" />
                                            Salvar Webhook
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Proxy Configuration Card */}
                        <div className="card p-6 mt-6">
                            <h3 className="font-semibold mb-6 flex items-center gap-2">
                                <Globe className="w-5 h-5 text-[var(--primary)]" />
                                Configuração de Proxy
                            </h3>

                            <div className="space-y-4">
                                {/* Toggle Proxy */}
                                <div
                                    onClick={() => setProxyEnabled(!proxyEnabled)}
                                    className="flex items-center justify-between p-4 rounded-lg border border-[var(--border)] hover:bg-[var(--card)] cursor-pointer transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
                                            <Globe className="w-5 h-5 text-[var(--primary)]" />
                                        </div>
                                        <div>
                                            <p className="font-medium">Usar Proxy</p>
                                            <p className="text-sm text-[var(--muted)]">
                                                {proxyEnabled ? 'Proxy ativo' : 'Conexão direta (sem proxy)'}
                                            </p>
                                        </div>
                                    </div>
                                    {proxyEnabled ? (
                                        <ToggleRight className="w-8 h-8 text-[var(--success)]" />
                                    ) : (
                                        <ToggleLeft className="w-8 h-8 text-[var(--muted)]" />
                                    )}
                                </div>

                                {/* Proxy Fields (shown when enabled) */}
                                {proxyEnabled && (
                                    <div className="space-y-4 p-4 rounded-lg border border-[var(--border)] bg-[var(--secondary)]/30 animate-fade-in">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium mb-2">Host (IPv4/IPv6)</label>
                                                <input
                                                    type="text"
                                                    placeholder="192.168.1.1 ou 2001:db8::1"
                                                    value={proxyHost}
                                                    onChange={(e) => setProxyHost(e.target.value)}
                                                    className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium mb-2">Porta</label>
                                                <input
                                                    type="text"
                                                    placeholder="8080"
                                                    value={proxyPort}
                                                    onChange={(e) => setProxyPort(e.target.value)}
                                                    className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium mb-2">Protocolo</label>
                                            <select
                                                value={proxyProtocol}
                                                onChange={(e) => setProxyProtocol(e.target.value as 'http' | 'https' | 'socks4' | 'socks5')}
                                                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                                            >
                                                <option value="http">HTTP</option>
                                                <option value="https">HTTPS</option>
                                                <option value="socks4">SOCKS4</option>
                                                <option value="socks5">SOCKS5</option>
                                            </select>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium mb-2">
                                                    Usuário <span className="text-[var(--muted)]">(opcional)</span>
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="username"
                                                    value={proxyUsername}
                                                    onChange={(e) => setProxyUsername(e.target.value)}
                                                    className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium mb-2">
                                                    Senha <span className="text-[var(--muted)]">(opcional)</span>
                                                </label>
                                                <input
                                                    type="password"
                                                    placeholder={proxyPasswordSet ? "••••••••" : "Nova senha"}
                                                    value={proxyPassword}
                                                    onChange={(e) => setProxyPassword(e.target.value)}
                                                    className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                                                />
                                                {proxyPasswordSet && !proxyPassword && (
                                                    <p className="text-xs text-[var(--muted)] mt-1">
                                                        Senha já configurada. Digite uma nova para alterar.
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                <button
                                    onClick={saveProxy}
                                    disabled={savingProxy || (proxyEnabled && (!proxyHost || !proxyPort))}
                                    className="btn btn-primary w-full"
                                >
                                    {savingProxy ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                            Salvando...
                                        </>
                                    ) : (
                                        <>
                                            <Save className="w-4 h-4 mr-2" />
                                            Salvar Proxy
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}

export default function InstanceDetailPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
            </div>
        }>
            <InstanceDetailContent />
        </Suspense>
    );
}
