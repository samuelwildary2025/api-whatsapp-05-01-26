'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
    LayoutDashboard,
    Smartphone,
    Megaphone,
    Settings,
    LogOut,
    User,
    ChevronRight,
    Download
} from 'lucide-react';
import { useRouter } from 'next/navigation';

export function Sidebar() {
    const pathname = usePathname();
    const { user, logout } = useAuth();
    const router = useRouter();

    const handleLogout = () => {
        logout();
        router.push('/');
    };

    const isActive = (path: string) => {
        if (path === '/dashboard' && pathname === '/dashboard') return true;
        if (path !== '/dashboard' && pathname.startsWith(path)) return true;
        return false;
    };

    const menuItems = [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
        { icon: Smartphone, label: 'Instâncias', path: '/dashboard/instances' },
        { icon: Megaphone, label: 'Campanhas', path: '/dashboard/campaigns' },
        { icon: Download, label: 'Exportar', path: '/dashboard/export' },
        { icon: Settings, label: 'Configurações', path: '/dashboard/settings' },
    ];

    return (
        <aside className="w-72 border-r border-[var(--border)] bg-[var(--card)] flex flex-col h-screen sticky top-0 transition-all duration-300">
            {/* Logo Area */}
            <div className="p-6 border-b border-[var(--border)]">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--primary)] flex items-center justify-center shadow-lg shadow-green-900/20">
                        <Smartphone className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="font-bold text-lg tracking-tight">WhatsApp API</h1>
                        <p className="text-xs text-[var(--muted-foreground)] font-medium">Painel Administrativo</p>
                    </div>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-4 py-6 space-y-1">
                {menuItems.map((item) => (
                    <Link
                        key={item.path}
                        href={item.path}
                        className={`group flex items-center justify-between px-3 py-2.5 rounded-lg transition-all duration-200 ${isActive(item.path)
                                ? 'bg-[var(--primary)]/10 text-[var(--primary)] font-medium'
                                : 'text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--foreground)]'
                            }`}
                    >
                        <div className="flex items-center gap-3">
                            <item.icon className={`w-5 h-5 ${isActive(item.path) ? 'text-[var(--primary)]' : 'text-[var(--muted-foreground)] group-hover:text-[var(--foreground)]'}`} />
                            <span>{item.label}</span>
                        </div>
                        {isActive(item.path) && <ChevronRight className="w-4 h-4 opacity-50" />}
                    </Link>
                ))}
            </nav>

            {/* User Profile Footer */}
            <div className="p-4 border-t border-[var(--border)] bg-[var(--background)]/50">
                <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--accent)] transition-colors cursor-pointer group">
                    <div className="w-10 h-10 rounded-full bg-[var(--secondary)] flex items-center justify-center border border-[var(--border)]">
                        <User className="w-5 h-5 text-[var(--muted-foreground)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate text-[var(--foreground)]">
                            {user?.name || 'Administrador'}
                        </p>
                        <p className="text-xs text-[var(--muted-foreground)] truncate">
                            {user?.email}
                        </p>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="p-2 rounded-md text-[var(--muted-foreground)] hover:text-[var(--destructive)] hover:bg-[var(--destructive)]/10 transition-colors"
                        title="Sair"
                    >
                        <LogOut className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </aside>
    );
}
