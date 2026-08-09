"use client";

import { useEffect, useState, useCallback } from "react";
import { AccuracyOverview as AccuracyOverviewData } from "@/types/admin";
import { AccuracyOverview } from "@/components/admin/accuracy/AccuracyOverview";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Target } from "lucide-react";
import { getAccuracyStatsAction } from "./actions";
import { useI18n } from "@/lib/use-i18n";

type WindowFilter = "30d" | "all";

export default function AdminAccuracyPage() {
    const { copy } = useI18n();
    const [windowFilter, setWindowFilter] = useState<WindowFilter>("all");
    const [data, setData] = useState<AccuracyOverviewData | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchStats = useCallback(async (filter: WindowFilter) => {
        setLoading(true);
        try {
            const result = await getAccuracyStatsAction(filter === "30d" ? 30 : null);
            if (result.success && result.data) {
                setData(result.data);
            }
        } catch (error) {
            console.error("Error fetching accuracy stats:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStats(windowFilter);
    }, [windowFilter, fetchStats]);

    return (
        <div className="space-y-8 animate-fade-in pb-12 max-w-5xl mx-auto">

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/10 pb-6">
                <div>
                    <h1 className="text-4xl font-black uppercase tracking-tight text-white mb-2 flex items-center gap-3">
                        <Target className="size-8 text-primary" />
                        {copy("Précision IA")}
                    </h1>
                    <p className="text-sm font-mono text-neutral-500">
                        {copy("Taux de réussite réel des analyses, calculé automatiquement une fois les matchs terminés.")}
                    </p>
                </div>
                <Tabs value={windowFilter} onValueChange={(v) => setWindowFilter(v as WindowFilter)}>
                    <TabsList className="bg-black/40 border border-white/10 p-1 rounded-full h-auto gap-1">
                        <TabsTrigger value="30d" className="rounded-full px-4 py-1.5 text-xs data-[state=active]:bg-white/10 data-[state=active]:text-white">
                            {copy("30 derniers jours")}
                        </TabsTrigger>
                        <TabsTrigger value="all" className="rounded-full px-4 py-1.5 text-xs data-[state=active]:bg-white/10 data-[state=active]:text-white">
                            {copy("Historique complet")}
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-24">
                    <Loader2 className="size-6 animate-spin text-primary" />
                </div>
            ) : data ? (
                <AccuracyOverview data={data} />
            ) : (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-center text-sm text-red-400">
                    {copy("Impossible de charger les statistiques.")}
                </div>
            )}
        </div>
    );
}
