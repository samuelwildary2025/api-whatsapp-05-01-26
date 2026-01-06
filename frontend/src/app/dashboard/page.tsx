'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';
import {
    Smartphone,
    Send,
    Users,
    Plus,
    Loader2,
    RefreshCw,
    Trash2,
    Eye,
    Megaphone,
    MoreVertical,
    Activity,
    Signal,
    Globe,
    ChevronDown,
    ChevronUp
} from 'lucide-react';
import toast from 'react-hot-toast';

interface Instance {
    id: string;
    name: string;
    token: string;
    status: string;
    waNumber?: string;
    waName?: string;
    qrCode?: string;
    createdAt: string;
}

interface Stats {
    users: number;
    instances: {
        total: number;
        connected: number;
        active: number;
        limit: number;
    };
    campaigns: number;
    messages: number;
}

export default function DashboardPage() {
    const [instances, setInstances] = useState<Instance[]>([]);
    const [stats, setStats] = useState<Stats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newInstanceName, setNewInstanceName] = useState('');
    const [creating, setCreating] = useState(false);

    // Proxy states
    const [useProxy, setUseProxy] = useState(false);
    const [proxyHost, setProxyHost] = useState('');
    const [proxyPort, setProxyPort] = useState('');
    const [proxyUsername, setProxyUsername] = useState('');
    const [proxyPassword, setProxyPassword] = useState('');
    const [proxyProtocol, setProxyProtocol] = useState<'http' | 'https' | 'socks4' | 'socks5'>('http');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const [instancesRes, statsRes] = await Promise.all([
                api.getInstances(),
                api.getStats(),
            ]);

            if (instancesRes.data) {
                setInstances(instancesRes.data);
            }
            if (statsRes.data) {
                setStats(statsRes.data);
            }
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateInstance = async () => {
        if (!newInstanceName.trim()) return;

        setCreating(true);
        try {
            const proxyConfig = useProxy && proxyHost && proxyPort ? {
                proxyHost,
                proxyPort,
                proxyUsername: proxyUsername || undefined,
                proxyPassword: proxyPassword || undefined,
                proxyProtocol,
            } : undefined;

            const response = await api.createInstance(newInstanceName, proxyConfig);
            if (response.data) {
                toast.success('Instância criada com sucesso!');
                setShowCreateModal(false);
                setNewInstanceName('');
                // Reset proxy fields
                setUseProxy(false);
                setProxyHost('');
                setProxyPort('');
                setProxyUsername('');
                setProxyPassword('');
                setProxyProtocol('http');
                loadData();
            }
        } catch (error: any) {
            toast.error(error.message || 'Erro ao criar instância');
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteInstance = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir esta instância?')) return;

        try {
            await api.deleteInstance(id);
            toast.success('Instância excluída');
            loadData();
        } catch (error: any) {
            toast.error(error.message || 'Erro ao excluir');
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
            </div>
        );
    }

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight text-[var(--foreground)]">Dashboard</h2>
                    <p className="text-[var(--muted-foreground)] mt-1">Visão geral do desempenho do sistema</p>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={loadData} className="btn btn-secondary">
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Atualizar
                    </button>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="btn btn-primary"
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        Nova Instância
                    </button>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="card p-6 relative overflow-hidden">
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-sm font-medium text-[var(--muted-foreground)]">Instâncias Ativas</p>
                        <Activity className="w-4 h-4 text-[var(--primary)]" />
                    </div>
                    <div className="flex items-end justify-between">
                        <div>
                            <p className="text-3xl font-bold text-[var(--foreground)]">{stats?.instances.connected || 0}</p>
                            <p className="text-xs text-[var(--muted-foreground)] mt-1">de {stats?.instances.total || 0} total</p>
                        </div>
                        <div className={`flex items-center text-xs font-medium ${stats?.instances.connected ? 'text-[var(--primary)]' : 'text-[var(--muted-foreground)]'}`}>
                            {stats?.instances.connected ? 'Online' : 'Offline'}
                        </div>
                    </div>
                    {/* Background decoration */}
                    <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-[var(--primary)]/5 rounded-full blur-2xl" />
                </div>

                <div className="card p-6 relative overflow-hidden">
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-sm font-medium text-[var(--muted-foreground)]">Mensagens Enviadas</p>
                        <Send className="w-4 h-4 text-blue-500" />
                    </div>
                    <div>
                        <p className="text-3xl font-bold text-[var(--foreground)]">{stats?.messages || 0}</p>
                        <p className="text-xs text-[var(--muted-foreground)] mt-1">+0% hoje</p>
                    </div>
                    <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-blue-500/5 rounded-full blur-2xl" />
                </div>

                <div className="card p-6 relative overflow-hidden">
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-sm font-medium text-[var(--muted-foreground)]">Campanhas Ativas</p>
                        <Megaphone className="w-4 h-4 text-purple-500" />
                    </div>
                    <div>
                        <p className="text-3xl font-bold text-[var(--foreground)]">{stats?.campaigns || 0}</p>
                        <p className="text-xs text-[var(--muted-foreground)] mt-1">Disparos automáticos</p>
                    </div>
                    <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-purple-500/5 rounded-full blur-2xl" />
                </div>

                <div className="card p-6 relative overflow-hidden">
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-sm font-medium text-[var(--muted-foreground)]">Usuários</p>
                        <Users className="w-4 h-4 text-orange-500" />
                    </div>
                    <div>
                        <p className="text-3xl font-bold text-[var(--foreground)]">{stats?.users || 0}</p>
                        <p className="text-xs text-[var(--muted-foreground)] mt-1">Admin e operadores</p>
                    </div>
                    <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-orange-500/5 rounded-full blur-2xl" />
                </div>
            </div>

            {/* Instances Section */}
            <div className="space-y-6">
                <div className="flex items-center gap-3">
                    <div className="h-8 w-1 bg-[var(--primary)] rounded-full" />
                    <h3 className="text-xl font-semibold text-[var(--foreground)]">Minhas Instâncias</h3>
                </div>

                {instances.length === 0 ? (
                    <div className="card p-16 text-center border-dashed">
                        <div className="w-16 h-16 rounded-full bg-[var(--secondary)] flex items-center justify-center mx-auto mb-6">
                            <Smartphone className="w-8 h-8 text-[var(--muted-foreground)]" />
                        </div>
                        <h4 className="text-lg font-semibold mb-2">Nenhuma instância configurada</h4>
                        <p className="text-[var(--muted-foreground)] max-w-sm mx-auto mb-8">
                            Conecte seu WhatsApp para começar a enviar mensagens e criar campanhas.
                        </p>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="btn btn-primary"
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Criar Primeira Instância
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {instances.map((instance) => (
                            <div
                                key={instance.id}
                                className="card card-hover group flex flex-col"
                            >
                                <div className="p-6 flex-1">
                                    <div className="flex items-start justify-between mb-6">
                                        <div className="flex items-center gap-4">
                                            <div className="relative">
                                                <div className="w-12 h-12 rounded-xl bg-[var(--secondary)] flex items-center justify-center border border-[var(--border)]">
                                                    <Smartphone className="w-6 h-6 text-[var(--foreground)]" />
                                                </div>
                                                <div className={`absolute -bottom-1 -right-1 status-dot ring-4 ring-[var(--card)] ${instance.status === 'connected' ? 'status-connected' :
                                                    instance.status === 'connecting' || instance.status === 'qr' ? 'status-connecting' :
                                                        'status-disconnected'
                                                    }`} />
                                            </div>
                                            <div>
                                                <h4 className="font-semibold text-base">{instance.name}</h4>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <Signal className="w-3 h-3 text-[var(--muted-foreground)]" />
                                                    <p className="text-xs text-[var(--muted-foreground)] capitalize">
                                                        {instance.status === 'qr' ? 'Aguardando Leitura' : instance.status}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="dropdown relative group/menu">
                                            <button className="p-2 rounded-lg hover:bg-[var(--secondary)] text-[var(--muted-foreground)] transition-colors">
                                                <MoreVertical className="w-4 h-4" />
                                            </button>
                                            {/* Dropdown would go here, simplified for now */}
                                        </div>
                                    </div>

                                    <div className="space-y-3 mb-6">
                                        <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--secondary)]/50">
                                            <span className="text-xs text-[var(--muted-foreground)]">Número</span>
                                            <span className="text-sm font-medium font-mono">{instance.waNumber ? `+${instance.waNumber}` : '---'}</span>
                                        </div>
                                        <div className="flex items-center justify-between p-3 rounded-lg bg-[var(--secondary)]/50">
                                            <span className="text-xs text-[var(--muted-foreground)]">Nome</span>
                                            <span className="text-sm font-medium">{instance.waName || '---'}</span>
                                        </div>
                                    </div>

                                    {instance.qrCode && instance.status !== 'connected' && (
                                        <div className="mb-6 p-4 bg-white rounded-xl border border-dashed border-gray-300 flex justify-center">
                                            <img
                                                src={instance.qrCode}
                                                alt="QR Code"
                                                className="w-32 h-32 object-contain mix-blend-multiply"
                                            />
                                        </div>
                                    )}
                                </div>

                                <div className="p-4 border-t border-[var(--border)] bg-[var(--secondary)]/20 flex gap-2">
                                    <Link
                                        href={`/dashboard/instance?id=${instance.id}`}
                                        className="btn btn-secondary flex-1 bg-[var(--card)]"
                                    >
                                        <Eye className="w-4 h-4 mr-2" />
                                        Gerenciar
                                    </Link>
                                    <button
                                        onClick={() => handleDeleteInstance(instance.id)}
                                        className="p-2 rounded-lg hover:bg-[var(--destructive)] hover:text-white text-[var(--destructive)] transition-colors border border-[var(--border)] bg-[var(--card)]"
                                        title="Excluir"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Create Instance Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
                    <div className={`card p-6 w-full shadow-2xl scale-100 transition-all duration-300 ${useProxy ? 'max-w-lg' : 'max-w-md'}`}>
                        <h3 className="text-xl font-bold mb-1">Nova Instância</h3>
                        <p className="text-sm text-[var(--muted-foreground)] mb-6">Configure uma nova conexão do WhatsApp</p>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-2 text-[var(--foreground)]">
                                    Nome de identificação
                                </label>
                                <input
                                    type="text"
                                    placeholder="Ex: Atendimento Comercial"
                                    value={newInstanceName}
                                    onChange={(e) => setNewInstanceName(e.target.value)}
                                    autoFocus
                                    className="w-full bg-[var(--secondary)] border border-[var(--border)] rounded-lg px-4 py-2 text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-all"
                                />
                            </div>

                            {/* Proxy Toggle */}
                            <div
                                onClick={() => setUseProxy(!useProxy)}
                                className="flex items-center justify-between p-3 rounded-lg border border-[var(--border)] hover:bg-[var(--secondary)]/50 cursor-pointer transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <Globe className="w-5 h-5 text-[var(--muted-foreground)]" />
                                    <div>
                                        <p className="font-medium text-sm">Usar Proxy</p>
                                        <p className="text-xs text-[var(--muted-foreground)]">Configure um proxy para esta instância</p>
                                    </div>
                                </div>
                                {useProxy ? (
                                    <ChevronUp className="w-5 h-5 text-[var(--primary)]" />
                                ) : (
                                    <ChevronDown className="w-5 h-5 text-[var(--muted-foreground)]" />
                                )}
                            </div>

                            {/* Proxy Fields - Expandable */}
                            {useProxy && (
                                <div className="space-y-4 p-4 rounded-lg border border-[var(--border)] bg-[var(--secondary)]/30 animate-fade-in">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-medium mb-1.5 text-[var(--foreground)]">
                                                Host (IPv4/IPv6)
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="192.168.1.1 ou 2001:db8::1"
                                                value={proxyHost}
                                                onChange={(e) => setProxyHost(e.target.value)}
                                                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-all"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium mb-1.5 text-[var(--foreground)]">
                                                Porta
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="8080"
                                                value={proxyPort}
                                                onChange={(e) => setProxyPort(e.target.value)}
                                                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-all"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-medium mb-1.5 text-[var(--foreground)]">
                                            Protocolo
                                        </label>
                                        <select
                                            value={proxyProtocol}
                                            onChange={(e) => setProxyProtocol(e.target.value as 'http' | 'https' | 'socks4' | 'socks5')}
                                            className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-all"
                                        >
                                            <option value="http">HTTP</option>
                                            <option value="https">HTTPS</option>
                                            <option value="socks4">SOCKS4</option>
                                            <option value="socks5">SOCKS5</option>
                                        </select>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-medium mb-1.5 text-[var(--foreground)]">
                                                Usuário <span className="text-[var(--muted-foreground)]">(opcional)</span>
                                            </label>
                                            <input
                                                type="text"
                                                placeholder="username"
                                                value={proxyUsername}
                                                onChange={(e) => setProxyUsername(e.target.value)}
                                                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-all"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium mb-1.5 text-[var(--foreground)]">
                                                Senha <span className="text-[var(--muted-foreground)]">(opcional)</span>
                                            </label>
                                            <input
                                                type="password"
                                                placeholder="••••••••"
                                                value={proxyPassword}
                                                onChange={(e) => setProxyPassword(e.target.value)}
                                                className="w-full bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--primary)] transition-all"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => {
                                        setShowCreateModal(false);
                                        setUseProxy(false);
                                        setProxyHost('');
                                        setProxyPort('');
                                        setProxyUsername('');
                                        setProxyPassword('');
                                        setProxyProtocol('http');
                                    }}
                                    className="btn btn-secondary flex-1"
                                    disabled={creating}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleCreateInstance}
                                    className="btn btn-primary flex-1"
                                    disabled={creating || !newInstanceName.trim() || (useProxy && (!proxyHost || !proxyPort))}
                                >
                                    {creating ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                            Criando...
                                        </>
                                    ) : (
                                        <>
                                            <Plus className="w-4 h-4 mr-2" />
                                            Criar Instância
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
