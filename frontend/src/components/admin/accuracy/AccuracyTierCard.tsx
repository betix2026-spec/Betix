"use client";

import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { AccuracyCategoryStats } from "@/types/admin";
import { useI18n } from "@/lib/use-i18n";

const TIER_CONFIG: Record<string, { label: string; text: string; bg: string; border: string; bar: string }> = {
    safe: {
        label: "Safe",
        text: "text-emerald-400",
        bg: "bg-emerald-500/10",
        border: "border-emerald-500/20",
        bar: "bg-emerald-500",
    },
    value: {
        label: "Value",
        text: "text-purple-400",
        bg: "bg-purple-500/10",
        border: "border-purple-500/20",
        bar: "bg-purple-500",
    },
    risky: {
        label: "Risky",
        text: "text-orange-400",
        bg: "bg-orange-500/10",
        border: "border-orange-500/20",
        bar: "bg-orange-500",
    },
};

export function AccuracyTierCard({ tier, stats, compact = false }: {
    tier: "safe" | "value" | "risky";
    stats: AccuracyCategoryStats;
    compact?: boolean;
}) {
    const { copy } = useI18n();
    const config = TIER_CONFIG[tier];
    const decided = stats.won + stats.lost;

    return (
        <div className={cn("rounded-2xl border p-4 sm:p-5", config.bg, config.border, compact && "p-3 sm:p-4")}>
            <div className="flex items-center justify-between mb-3">
                <span className={cn("text-[10px] font-black uppercase tracking-[0.2em]", config.text)}>
                    {config.label}
                </span>
                <span className={cn("text-2xl sm:text-3xl font-black tabular-nums leading-none", config.text)}>
                    {stats.winRate !== null ? `${stats.winRate}%` : "—"}
                </span>
            </div>

            <Progress
                value={stats.winRate ?? 0}
                className="h-1.5 bg-white/5 mb-3"
                indicatorClassName={config.bar}
            />

            <div className="flex items-center justify-between text-[11px] font-mono text-neutral-500">
                <span>
                    {stats.won}W – {stats.lost}L{stats.push > 0 ? ` – ${stats.push} ${copy("push")}` : ""}
                </span>
                <span>
                    {decided > 0
                        ? `${decided} ${copy("verifiés")}`
                        : copy("Pas encore de résultat")}
                </span>
            </div>
        </div>
    );
}
