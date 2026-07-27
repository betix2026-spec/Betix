"use client";

import { useEffect, useState } from "react";
import { AdminHUD } from "@/components/admin/dashboard/AdminHUD";
import { RevenueHoloChart } from "@/components/admin/dashboard/RevenueHoloChart";
import { LiveTerminal } from "@/components/admin/dashboard/LiveTerminal";
import { ServerCore } from "@/components/admin/dashboard/ServerCore";
import { AdminKPI, RevenueData, ActivityLog, SystemService } from "@/types/admin";
import { useI18n } from "@/lib/use-i18n";
import { getAdminOverviewAction } from "./actions";
import { Loader2 } from "lucide-react";

const KPI_LABEL_KEYS: Record<string, string> = {
    users: "Utilisateurs",
    subs: "Abonnés",
    preds: "Prédictions",
};

export default function AdminDashboardPage() {
    const { copy, t } = useI18n();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [kpis, setKpis] = useState<AdminKPI[]>([]);
    const [revenueData, setRevenueData] = useState<RevenueData[]>([]);
    const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
    const [systemServices, setSystemServices] = useState<SystemService[]>([]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const result = await getAdminOverviewAction();
            if (cancelled) return;
            if (!result.success || !result.kpis) {
                setError(result.error || t("adminOverviewLoadError"));
                setLoading(false);
                return;
            }
            setKpis(result.kpis.map((k) => ({ ...k, label: k.id === "mrr" ? "MRR" : copy(KPI_LABEL_KEYS[k.id || ""] || "") })));
            setRevenueData(result.revenue || []);
            setActivityLogs(result.activity || []);
            setSystemServices(result.services || []);
            setLoading(false);
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="space-y-8 animate-fade-in pb-12">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-black uppercase tracking-tight text-white">{copy("Vue d'ensemble")}</h1>
                <p className="text-sm font-mono text-neutral-500 mt-1">{copy("System status: online")}</p>
            </div>

            {error && (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 text-red-400 text-sm px-4 py-3">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center py-20 text-neutral-500 gap-2">
                    <Loader2 className="size-5 animate-spin" />
                    {t("loading")}
                </div>
            ) : (
                <>
                    {/* 1. HUD (KPIs) */}
                    <AdminHUD kpis={kpis} />

                    {/* 2. Main Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Left Column (Chart) */}
                        <div className="lg:col-span-2 space-y-2">
                            <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-600 px-2">{copy("Revenue Streams")}</h2>
                            {revenueData.some((d) => d.revenue > 0) ? (
                                <RevenueHoloChart data={revenueData} />
                            ) : (
                                <div className="h-[400px] flex items-center justify-center border border-white/5 rounded-3xl bg-black/40 text-neutral-500 text-sm">
                                    {copy("Aucune donnée de revenus disponible.")}
                                </div>
                            )}
                        </div>

                        {/* Right Column (Terminal) */}
                        <div className="space-y-2">
                            <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-600 px-2">{copy("Live Logs")}</h2>
                            <LiveTerminal logs={activityLogs} />
                        </div>
                    </div>

                    {/* 3. System Core */}
                    <div className="space-y-2">
                        <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-600 px-2">{copy("Infrastructure")}</h2>
                        <ServerCore services={systemServices} />
                    </div>
                </>
            )}
        </div>
    );
}
