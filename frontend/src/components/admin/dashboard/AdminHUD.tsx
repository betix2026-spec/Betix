"use client";

import { AdminKPI } from "@/types/admin";
import { cn } from "@/lib/utils";
import { Users, CreditCard, DollarSign, Target, TrendingUp, TrendingDown } from "lucide-react";
import { useI18n } from "@/lib/use-i18n";

interface AdminHUDProps {
    kpis: AdminKPI[];
}

export function AdminHUD({ kpis }: AdminHUDProps) {
    const { copy } = useI18n();
    // Icon mapping
    const icons: Record<string, React.ElementType> = {
        mrr: DollarSign,
        users: Users,
        subs: CreditCard,
        preds: Target,
    };

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 animate-in fade-in slide-in-from-top-4 duration-700">
            {kpis.map((kpi, index) => {
                const Icon = (kpi.id && icons[kpi.id]) || Target;
                const isPositive = kpi.trend === "up";
                const colorClass = kpi.id === "mrr" ? "text-emerald-400" : kpi.id === "preds" ? "text-amber-400" : "text-blue-400";

                return (
                    <div key={kpi.id} className="relative group overflow-hidden bg-black/40 border border-white/10 backdrop-blur-xl rounded-2xl p-5 hover:border-white/20 transition-all duration-500">
                        {/* Scanline Effect */}
                        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent bg-[length:100%_4px] pointer-events-none opacity-20" />

                        <div className="relative z-10 flex items-start justify-between">
                            <div className="space-y-1">
                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neutral-500">{kpi.label}</p>
                                <div className="flex items-baseline gap-2">
                                    <span className={cn("text-3xl font-black tracking-tighter tabular-nums text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.1)]")}>
                                        {kpi.value}
                                    </span>
                                </div>
                            </div>
                            <div className={cn("size-10 rounded-xl flex items-center justify-center border bg-white/5", "border-white/10", colorClass)}>
                                <Icon className="size-5" />
                            </div>
                        </div>

                        {/* Sparkline Visual Placeholder */}
                        <div className="mt-4 h-8 flex items-end justify-between gap-1 opacity-50">
                            {kpi.sparklineData?.map((val, i) => (
                                <div
                                    key={i}
                                    className={cn("w-full rounded-t-sm transition-all duration-300 group-hover:opacity-100",
                                        isPositive ? "bg-emerald-500/50" : "bg-red-500/50"
                                    )}
                                    style={{ height: `${(val / (Math.max(...(kpi.sparklineData || [])) || 1)) * 100}%` }}
                                />
                            ))}
                        </div>

                        {/* Trend Indicator */}
                        <div className="flex items-center gap-2 mt-2 text-xs font-medium">
                            <span className={cn("flex items-center gap-1", isPositive ? "text-emerald-400" : "text-red-400")}>
                                {isPositive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                                {kpi.change > 0 ? "+" : ""}{kpi.change}%
                            </span>
                            <span className="text-neutral-600">{copy("vs 30j")}</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
