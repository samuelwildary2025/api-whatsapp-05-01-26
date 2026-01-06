'use client';

import { Megaphone } from 'lucide-react';

export default function CampaignsPage() {
    return (
        <div className="p-8">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h2 className="text-2xl font-bold">Campanhas</h2>
                    <p className="text-[var(--muted)]">Gerencie suas campanhas de envio</p>
                </div>
            </div>

            <div className="glass rounded-xl p-12 text-center">
                <Megaphone className="w-12 h-12 mx-auto mb-4 text-[var(--muted)]" />
                <h4 className="font-semibold mb-2">Em breve</h4>
                <p className="text-[var(--muted)]">
                    O módulo de campanhas está em desenvolvimento.
                </p>
            </div>
        </div>
    );
}
