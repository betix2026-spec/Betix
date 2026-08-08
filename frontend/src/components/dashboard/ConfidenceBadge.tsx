"use client";

import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import { Match, Prediction } from "@/types/match";
import { useI18n } from "@/lib/use-i18n";

const LEVEL_STYLES: Record<string, string> = {
    safe: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_-4px_rgba(16,185,129,0.5)]",
    value: "bg-purple-500/10 text-purple-400 border-purple-500/20 shadow-[0_0_10px_-4px_rgba(168,85,247,0.5)]",
    risky: "bg-orange-500/10 text-orange-400 border-orange-500/20 shadow-[0_0_10px_-4px_rgba(249,115,22,0.5)]",
};

/**
 * Dashboard-list confidence teaser. Shows a real number for a top-tier
 * match with a ready analysis, a pulsing "analyzing" chip while one is
 * generating, and nothing at all otherwise — out-of-scope or ungenerated
 * matches render no badge, they're not locked or faked.
 */
export function ConfidenceBadge({
    badge,
    topPrediction,
}: {
    badge?: Match["confidenceBadge"];
    topPrediction?: Prediction;
}) {
    const { copy } = useI18n();

    // The match detail page still populates `predictions` in full (it has
    // its own fetch); prefer that when present so the two stay consistent.
    if (topPrediction) {
        return (
            <Badge
                className={`text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 h-5 border truncate shrink-0 ${LEVEL_STYLES[topPrediction.level]}`}
            >
                <span className="hidden sm:inline mr-1">{topPrediction.level.toUpperCase()}</span>
                {topPrediction.confidence}%
            </Badge>
        );
    }

    if (!badge) return null;

    if (badge.status === "pending") {
        return (
            <Badge
                variant="outline"
                className="text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 h-5 border-primary/20 bg-primary/5 text-primary/80 shrink-0 gap-1"
            >
                <Sparkles className="size-2.5 animate-pulse" />
                <span className="hidden sm:inline">{copy("Analyse en cours")}</span>
            </Badge>
        );
    }

    if (badge.status === "ready" && badge.topLevel && badge.topConfidence != null) {
        return (
            <Badge
                className={`text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 h-5 border truncate shrink-0 ${LEVEL_STYLES[badge.topLevel]}`}
            >
                <span className="hidden sm:inline mr-1">{badge.topLevel.toUpperCase()}</span>
                {badge.topConfidence}%
            </Badge>
        );
    }

    return null;
}
