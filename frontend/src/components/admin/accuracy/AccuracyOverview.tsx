"use client";

import { AccuracyOverview as AccuracyOverviewData } from "@/types/admin";
import { SportIcon } from "@/components/icons/SportIcons";
import { AccuracyTierCard } from "./AccuracyTierCard";
import { Target, Sparkles } from "lucide-react";
import { useI18n } from "@/lib/use-i18n";

const SPORT_LABELS: Record<string, string> = {
    football: "Football",
    basketball: "Basketball",
    tennis: "Tennis",
};

export function AccuracyOverview({ data }: { data: AccuracyOverviewData }) {
    const { copy } = useI18n();

    if (data.gradedAudits === 0) {
        return (
            <div className="rounded-2xl border border-white/10 bg-black/40 p-10 text-center">
                <Sparkles className="size-8 text-neutral-600 mx-auto mb-4" />
                <p className="text-sm font-bold text-white mb-1">{copy("Aucune donnée pour l'instant")}</p>
                <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                    {copy("Les analyses sont notées automatiquement dès qu'un match se termine. Revenez une fois les premiers matchs joués.")}
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            {/* Overall */}
            <div>
                <div className="flex items-center gap-2 mb-4">
                    <Target className="size-4 text-primary" />
                    <h2 className="text-sm font-black uppercase tracking-widest text-white">{copy("Vue d'ensemble")}</h2>
                    <span className="text-[11px] font-mono text-neutral-500">
                        {data.gradedAudits} {copy("analyses notées")} · {data.gradedPicks} {copy("paris vérifiés")}
                    </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <AccuracyTierCard tier="safe" stats={data.overall.safe} />
                    <AccuracyTierCard tier="value" stats={data.overall.value} />
                    <AccuracyTierCard tier="risky" stats={data.overall.risky} />
                </div>
            </div>

            {/* Per sport */}
            <div>
                <h2 className="text-sm font-black uppercase tracking-widest text-white mb-4">{copy("Par sport")}</h2>
                <div className="space-y-4">
                    {data.bySport.map((sport) => (
                        <div key={sport.sport} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
                            <div className="flex items-center gap-2.5 mb-4">
                                <div className="flex items-center justify-center size-8 rounded-lg bg-white/5 text-neutral-300">
                                    <SportIcon sport={sport.sport} size={16} />
                                </div>
                                <span className="text-sm font-bold text-white">{SPORT_LABELS[sport.sport]}</span>
                                <span className="text-[11px] font-mono text-neutral-500">
                                    {sport.gradedAudits} {copy("analyses notées")}
                                </span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <AccuracyTierCard tier="safe" stats={sport.safe} compact />
                                <AccuracyTierCard tier="value" stats={sport.value} compact />
                                <AccuracyTierCard tier="risky" stats={sport.risky} compact />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
