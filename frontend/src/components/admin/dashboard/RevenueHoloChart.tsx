"use client";

import { RevenueData } from "@/types/admin";
import { cn } from "@/lib/utils";
import { BarChart3, TrendingUp } from "lucide-react";
import { useI18n } from "@/lib/use-i18n";

interface RevenueHoloChartProps {
    data: RevenueData[];
}

export function RevenueHoloChart({ data }: RevenueHoloChartProps) {
    const { copy, t } = useI18n();
    const maxRevenue = Math.max(...data.map(d => d.revenue), 1);
    const prevRevenue = data[data.length - 2]?.revenue ?? 0;
    const currRevenue = data[data.length - 1]?.revenue ?? 0;
    const growthPct = prevRevenue > 0
        ? Math.round(((currRevenue - prevRevenue) / prevRevenue) * 1000) / 10
        : (currRevenue > 0 ? 100 : 0);

    return (
        <div className="relative overflow-hidden rounded-3xl bg-black border border-white/5 backdrop-blur-xl h-[400px] group">

            {/* Holographic Grid Background */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />

            {/* Ambient Glow */}
            <div className="absolute -top-24 -left-24 size-64 bg-emerald-500/10 blur-[100px] pointer-events-none" />

            <div className="relative z-10 p-6 sm:p-8 flex flex-col h-full">

                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <BarChart3 className="size-5 text-emerald-400" />
                            {copy("Revenus Mensuels")}
                        </h3>
                        <p className="text-sm text-neutral-500 font-mono mt-1">{t("dashboardRevenueSubtitle")}</p>
                    </div>
                    <div className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold uppercase tracking-wider",
                        growthPct >= 0 ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-red-500/10 border-red-500/20 text-red-400"
                    )}>
                        <TrendingUp className={cn("size-3.5", growthPct < 0 && "rotate-180")} />
                        {growthPct > 0 ? "+" : ""}{growthPct}% {t("dashboardGrowthLabel")}
                    </div>
                </div>

                {/* The Chart */}
                <div className="flex-1 flex items-end justify-between gap-4 sm:gap-6 px-4 pb-4">
                    {data.map((item, index) => {
                        const heightPercent = (item.revenue / maxRevenue) * 100;
                        return (
                            <div key={item.month} className="flex-1 flex flex-col items-center gap-3 group/bar h-full justify-end relative">

                                {/* Tooltip (Holo-popup) */}
                                <div className="absolute -top-12 opacity-0 group-hover/bar:opacity-100 transition-opacity duration-300 bg-black/80 border border-emerald-500/30 text-emerald-400 text-xs font-mono py-1 px-3 rounded-lg pointer-events-none z-20 whitespace-nowrap backdrop-blur-md shadow-[0_0_15px_rgba(16,185,129,0.2)] transform translate-y-2 group-hover/bar:translate-y-0">
                                    {item.revenue}€ • {item.newSubs} Subs
                                </div>

                                {/* The Bar */}
                                <div className="w-full max-w-[60px] relative flex flex-col justify-end" style={{ height: `${heightPercent}%` }}>
                                    {/* Top Cap */}
                                    <div className="h-[2px] w-full bg-emerald-400 shadow-[0_0_10px_#34d399]" />

                                    {/* Body Gradient */}
                                    <div className="flex-1 w-full bg-gradient-to-t from-emerald-500/5 to-emerald-500/30 border-x border-emerald-500/20 transition-all duration-300 group-hover/bar:bg-emerald-500/20" />

                                    {/* Reflection / Bottom fade */}
                                    <div className="absolute bottom-0 w-full h-1 bg-emerald-500/40 blur-[2px]" />
                                </div>

                                {/* Label */}
                                <span className="text-xs font-bold text-neutral-600 uppercase tracking-wider group-hover/bar:text-white transition-colors">
                                    {item.month}
                                </span>
                            </div>
                        );
                    })}
                </div>

            </div>
        </div>
    );
}
