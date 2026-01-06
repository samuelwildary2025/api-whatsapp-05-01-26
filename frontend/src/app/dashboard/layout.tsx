'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { Sidebar } from '@/components/Sidebar';
import { Loader2 } from 'lucide-react';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user, isLoading: authLoading, checkAuth } = useAuth();
    const router = useRouter();
    const [isChecking, setIsChecking] = useState(true);

    useEffect(() => {
        const verify = async () => {
            await checkAuth();
            setIsChecking(false);
        };
        verify();
    }, []);

    useEffect(() => {
        if (!isChecking && !user) {
            router.push('/');
        }
    }, [isChecking, user, router]);

    if (authLoading || isChecking) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a]">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--primary)]" />
            </div>
        );
    }

    if (!user) return null;

    return (
        <div className="min-h-screen flex bg-[#09090b]">
            <Sidebar />
            <main className="flex-1 overflow-auto h-screen bg-[#09090b]">
                {children}
            </main>
        </div>
    );
}
