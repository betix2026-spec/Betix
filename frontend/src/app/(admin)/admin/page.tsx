"use client";

import { AdminHUD } from "@/components/admin/dashboard/AdminHUD";
import { RevenueHoloChart } from "@/components/admin/dashboard/RevenueHoloChart";
import { LiveTerminal } from "@/components/admin/dashboard/LiveTerminal";
import { ServerCore } from "@/components/admin/dashboard/ServerCore";
import { AdminKPI, RevenueData, ActivityLog, SystemService } from "@/types/admin";
import { useI18n } from "@/lib/use-i18n";

export default function AdminDashboardPage() {
    const { copy } = useI18n();
    // ZERO-STATE CONSTANTS
    const mockAdminKPIs: AdminKPI[] = [
        { id: "users", label: copy("Utilisateurs"), value: "0", change: 0, trend: "neutral", icon: "users", sparklineData: [] },
        { id: "subs", label: copy("Abonnés"), value: "0", change: 0, trend: "neutral", icon: "subs", sparklineData: [] },
        { id: "mrr", label: "MRR", value: "0€", change: 0, trend: "neutral", icon: "mrr", sparklineData: [] },
        { id: "preds", label: copy("Prédictions"), value: "0", change: 0, trend: "neutral", icon: "preds", sparklineData: [] },
    ];

    const mockRevenueData: RevenueData[] = [];
    const mockActivityLogs: ActivityLog[] = [];
    const mockSystemServices: SystemService[] = [
        { name: "Database", status: "operational", uptime: 100, latency: 0, load: 0 },
        { name: "API", status: "operational", uptime: 100, latency: 0, load: 0 },
    ];

    return (
        <div className="space-y-8 animate-fade-in pb-12">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-black uppercase tracking-tight text-white">{copy("Mission Control")}</h1>
                <p className="text-sm font-mono text-neutral-500 mt-1">{copy(":: SYSTEM STATUS: ONLINE ::")}</p>
                <p className="text-xs text-neutral-600 mt-2">{copy("Mode Sans Échec: Données de démonstration désactivées.")}</p>
            </div>

            {/* 1. HUD (KPIs) */}
            <AdminHUD kpis={mockAdminKPIs} />

            {/* 2. Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column (Chart) */}
                <div className="lg:col-span-2 space-y-2">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-600 px-2">{copy("Revenue Streams")}</h2>
                    {mockRevenueData.length > 0 ? (
                        <RevenueHoloChart data={mockRevenueData} />
                    ) : (
                        <div className="h-[400px] flex items-center justify-center border border-white/5 rounded-3xl bg-black/40 text-neutral-500 text-sm">
                            {copy("Aucune donnée de revenus disponible.")}
                        </div>
                    )}
                </div>

                {/* Right Column (Terminal) */}
                <div className="space-y-2">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-600 px-2">{copy("Live Logs")}</h2>
                    <LiveTerminal logs={mockActivityLogs} />
                </div>
            </div>

            {/* 3. System Core */}
            <div className="space-y-2">
                <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-600 px-2">{copy("Infrastructure")}</h2>
                <ServerCore services={mockSystemServices} />
            </div>
        </div>
    );
}
