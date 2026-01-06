'use client';

import { Suspense } from 'react';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import Link from 'next/link';
import {
    Smartphone,
    Plus,
    Loader2,
    RefreshCw,
    Trash2,
    Eye,
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

function InstancesContent() {
    const [instances, setInstances] = useState<Instance[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newInstanceName, setNewInstanceName] = useState('');
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const response = await api.getInstances();
            if (response.data) {
                setInstances(response.data as Instance[]);
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
            const response = await api.createInstance(newInstanceName);
            if (response.data) {
                toast.success('Instância criada com sucesso!');
                setShowCreateModal(false);
                setNewInstanceName('');
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
        <div className="p-8">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h2 className="text-2xl font-bold">Instâncias</h2>
                    <p className="text-[var(--muted)]">Gerencie suas instâncias do WhatsApp</p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="btn btn-primary"
                >
                    <Plus className="w-4 h-4" />
                    Nova Instância
                </button>
            </div>

            {instances.length === 0 ? (
                <div className="glass rounded-xl p-12 text-center">
                    <Smartphone className="w-12 h-12 mx-auto mb-4 text-[var(--muted)]" />
                    <h4 className="font-semibold mb-2">Nenhuma instância</h4>
                    <p className="text-[var(--muted)] mb-4">
                        Crie sua primeira instância para começar
                    </p>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="btn btn-primary"
                    >
                        <Plus className="w-4 h-4" />
                        Criar Instância
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {instances.map((instance) => (
                        <div
                            key={instance.id}
                            className="glass rounded-xl p-5 card-hover"
                        >
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div
                                        className={`w-3 h-3 rounded-full ${instance.status === 'connected'
                                                ? 'status-connected'
                                                : instance.status === 'connecting' ||
                                                    instance.status === 'qr'
                                                    ? 'status-connecting'
                                                    : 'status-disconnected'
                                            }`}
                                    />
                                    <div>
                                        <h4 className="font-semibold">{instance.name}</h4>
                                        <p className="text-xs text-[var(--muted)]">
                                            {instance.waNumber || 'Não conectado'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Link
                                        href={`/dashboard/instance?id=${instance.id}`}
                                        className="p-2 rounded-lg hover:bg-[var(--card-hover)] transition-colors"
                                    >
                                        <Eye className="w-4 h-4" />
                                    </Link>
                                    <button
                                        onClick={() => handleDeleteInstance(instance.id)}
                                        className="p-2 rounded-lg hover:bg-[var(--danger)]/20 text-[var(--danger)] transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2 text-sm">
                                <div className="flex items-center justify-between">
                                    <span className="text-[var(--muted)]">Status</span>
                                    <span
                                        className={`capitalize ${instance.status === 'connected'
                                                ? 'text-[var(--success)]'
                                                : instance.status === 'connecting' ||
                                                    instance.status === 'qr'
                                                    ? 'text-[var(--warning)]'
                                                    : 'text-[var(--danger)]'
                                            }`}
                                    >
                                        {instance.status === 'qr' ? 'Aguardando QR' : instance.status}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-[var(--muted)]">Nome WA</span>
                                    <span>{instance.waName || '-'}</span>
                                </div>
                            </div>

                            {instance.qrCode && instance.status !== 'connected' && (
                                <div className="mt-4 p-4 bg-white rounded-lg flex justify-center items-center overflow-hidden">
                                    <img
                                        src={instance.qrCode}
                                        alt="QR Code"
                                        className="w-full max-w-[200px] h-auto object-contain"
                                    />
                                </div>
                            )}

                            <Link
                                href={`/dashboard/instance?id=${instance.id}`}
                                className="btn btn-secondary w-full mt-4"
                            >
                                <Eye className="w-4 h-4" />
                                Ver Detalhes
                            </Link>
                        </div>
                    ))}
                </div>
            )}

            {/* Create Instance Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="glass rounded-2xl p-6 w-full max-w-md animate-fade-in">
                        <h3 className="text-xl font-semibold mb-4">Nova Instância</h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-2">
                                    Nome da instância
                                </label>
                                <input
                                    type="text"
                                    placeholder="Minha Instância"
                                    value={newInstanceName}
                                    onChange={(e) => setNewInstanceName(e.target.value)}
                                    autoFocus
                                />
                            </div>

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setShowCreateModal(false)}
                                    className="btn btn-secondary flex-1"
                                    disabled={creating}
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleCreateInstance}
                                    className="btn btn-primary flex-1"
                                    disabled={creating || !newInstanceName.trim()}
                                >
                                    {creating ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Criando...
                                        </>
                                    ) : (
                                        <>
                                            <Plus className="w-4 h-4" />
                                            Criar
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

export default function InstancesPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
            </div>
        }>
            <InstancesContent />
        </Suspense>
    );
}
