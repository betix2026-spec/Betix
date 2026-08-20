"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowRight, Bot, Sparkles } from "lucide-react";
import { SportIcon } from "@/components/icons/SportIcons";
import { Match } from "@/types/match";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/use-i18n";
import { ConfidenceBadge } from "@/components/dashboard/ConfidenceBadge";

interface MatchCardProps {
    match: Match;
}

export function MatchCard({ match }: MatchCardProps) {
    const { copy, locale } = useI18n();
    const league = match.league;
    const isLive = match.status === "live";
    const isFinished = match.status === "finished";
    const topPrediction = match.predictions?.[0];

    const normalizedSport = (match.sport || "football").toLowerCase();
    const sportDetails = normalizedSport === "football"
        ? {
            borderColor: "#4ade80",
            glow: "shadow-[0_0_20px_-10px_rgba(74,222,128,0.3)] hover:shadow-[0_0_30px_-5px_rgba(74,222,128,0.4)]",
            text: "text-green-400"
        }
        : normalizedSport === "basketball"
            ? {
                borderColor: "#fb923c",
                glow: "shadow-[0_0_20px_-10px_rgba(251,146,60,0.3)] hover:shadow-[0_0_30px_-5px_rgba(251,146,60,0.4)]",
                text: "text-orange-400"
            }
            : {
                borderColor: "#facc15",
                glow: "shadow-[0_0_20px_-10px_rgba(250,204,21,0.3)] hover:shadow-[0_0_30px_-5px_rgba(250,204,21,0.4)]",
                text: "text-yellow-400"
            };

    return (
        <Card
            style={{
                borderLeftColor: sportDetails.borderColor,
                borderLeftStyle: 'solid',
                borderLeftWidth: '3px'
            }}
            className={cn(
                "relative overflow-hidden bg-black/40 backdrop-blur-xl border border-white/10",
                "transition-all duration-500 group h-full flex flex-col justify-between",
                "hover:border-white/20 hover:-translate-y-1.5 hover:scale-[1.01] hover:shadow-2xl hover:shadow-primary/5",
                sportDetails.glow
            )}>
            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.03] to-transparent pointer-events-none" />

            <CardContent className="p-5 relative z-10 space-y-5">
                {/* Header: League & Status */}
                <div className="flex flex-wrap items-center justify-between gap-y-2 gap-x-1 mb-3">
                    {/* League Name - Fluid Left */}
                    <div className="flex items-center gap-1.5 sm:gap-2 text-[9px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-widest leading-tight w-full xs:w-auto flex-1 min-w-[120px]">
                        <SportIcon sport={match.sport} size={12} className={cn("shrink-0 sm:size-[14px]", sportDetails.text)} />
                        <span className="truncate">{league?.name}</span>
                    </div>

                    {/* Badges Container - Fluid Right */}
                    <div className="flex items-center justify-end gap-2 shrink-0">
                        {/* Status Badge */}
                        <div className="flex flex-col items-center">
                            {isLive ? (
                                <Badge className="bg-red-500/90 hover:bg-red-500 text-white border-0 px-2 py-0 text-[9px] sm:text-[10px] font-black tracking-widest shadow-lg shadow-red-500/20 backdrop-blur-md animate-pulse">
                                    LIVE
                                </Badge>
                            ) : match.status === "imminent" ? (
                                <Badge className="bg-amber-500/90 hover:bg-amber-500 text-white border-0 px-2 py-0 text-[9px] sm:text-[10px] font-black tracking-widest shadow-lg shadow-amber-500/20 backdrop-blur-md animate-pulse">
                                    IMMINENT
                                </Badge>
                            ) : isFinished ? (
                                <Badge variant="outline" className="bg-neutral-900/60 border-white/10 text-neutral-400 px-2 py-0 text-[9px] sm:text-[10px] font-black tracking-widest backdrop-blur-md">
                                    {copy("TERMINÉ")}
                                </Badge>
                            ) : (
                                <Badge className="bg-blue-600/90 hover:bg-blue-600 text-white border-0 px-2 py-0 text-[9px] sm:text-[10px] font-black tracking-widest shadow-lg shadow-blue-500/20 backdrop-blur-md">
                                    {copy("PROCHAINEMENT")}
                                </Badge>
                            )}
                        </div>

                        {/* Confidence badge — dashboard-list teaser (see confidenceBadge on Match) */}
                        <ConfidenceBadge badge={match.confidenceBadge} topPrediction={topPrediction} marketTeaser={match.marketTeaser} />
                    </div>
                </div>

                {/* Match Content */}
                <div className="flex items-center justify-between gap-1 sm:gap-4">
                    {/* Home */}
                    <div className="flex-1 flex items-center gap-1.5 sm:gap-4 min-w-0">
                        <div className={cn(
                            "size-10 sm:size-16 bg-neutral-900 border border-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-inner transition-all duration-500",
                            match.sport === 'tennis' ? "rounded-xl" : "rounded-full"
                        )}>
                            {match.homeTeam.logo ? (
                                <img
                                    src={match.homeTeam.logo}
                                    alt={match.homeTeam.name}
                                    className={cn(
                                        "size-full transition-transform duration-500 group-hover:scale-110",
                                        match.sport === 'tennis' ? "object-cover" : "object-contain p-2 sm:p-2.5"
                                    )}
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                        (e.target as HTMLImageElement).parentElement!.innerHTML = `<span class="text-[10px] sm:text-xs font-bold text-muted-foreground">${match.homeTeam.short}</span>`;
                                    }}
                                />
                            ) : (
                                <span className="text-[10px] sm:text-xs font-bold text-muted-foreground">{match.homeTeam.short}</span>
                            )}
                        </div>
                        <span className="text-[11px] min-[400px]:text-xs sm:text-sm font-semibold line-clamp-2 leading-tight text-white">{match.homeTeam.name}</span>
                    </div>

                    {/* Score / Time */}
                    <div className="flex flex-col items-center justify-center min-w-[50px] sm:min-w-[60px]">
                        {isLive || isFinished ? (
                            <div className="flex flex-col items-center gap-0.5">
                                {/* Tennis: text score (e.g. "6-3, 7-5") */}
                                {match.sport === "tennis" && match.scoreDisplay ? (
                                    <div className="text-sm sm:text-base font-bold font-mono tracking-tight text-white text-center leading-tight">
                                        {match.scoreDisplay}
                                    </div>
                                ) : (
                                    /* Football & Basketball: numeric score */
                                    <div className="text-lg sm:text-xl font-bold font-mono tracking-tighter text-white whitespace-nowrap">
                                        {match.homeScore ?? 0} - {match.awayScore ?? 0}
                                    </div>
                                )}
                                {/* Live status indicator (e.g. "45'" for football, "Q3" for basketball, "Set 2" for tennis) */}
                                {isLive && match.statusShort && (
                                    <span className="text-[9px] font-bold text-red-400 uppercase tracking-wider">
                                        {match.statusShort}
                                    </span>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-1">
                                <div className="text-base sm:text-lg font-bold font-mono text-white">{match.time}</div>
                                <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-tighter">
                                    {(() => {
                                        const now = new Date();
                                        const matchDateStr = match.date;
                                        const todayStr = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
                                        const tomorrowDate = new Date(now);
                                        tomorrowDate.setDate(now.getDate() + 1);
                                        const tomorrowStr = [tomorrowDate.getFullYear(), String(tomorrowDate.getMonth() + 1).padStart(2, '0'), String(tomorrowDate.getDate()).padStart(2, '0')].join('-');

                                        if (matchDateStr === todayStr) return copy("Aujourd'hui");
                                        if (matchDateStr === tomorrowStr) return copy("Demain");
                                        return new Date(matchDateStr).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
                                    })()}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Away */}
                    <div className="flex-1 flex items-center justify-end gap-1.5 sm:gap-4 min-w-0">
                        <span className="text-[11px] min-[400px]:text-xs sm:text-sm font-semibold line-clamp-2 leading-tight text-white text-right">{match.awayTeam.name}</span>
                        <div className={cn(
                            "size-10 sm:size-16 bg-neutral-900 border border-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-inner transition-all duration-500",
                            match.sport === 'tennis' ? "rounded-xl" : "rounded-full"
                        )}>
                            {match.awayTeam.logo ? (
                                <img
                                    src={match.awayTeam.logo}
                                    alt={match.awayTeam.name}
                                    className={cn(
                                        "size-full transition-transform duration-500 group-hover:scale-110",
                                        match.sport === 'tennis' ? "object-cover" : "object-contain p-2 sm:p-2.5"
                                    )}
                                    onError={(e) => {
                                        (e.target as HTMLImageElement).style.display = 'none';
                                        (e.target as HTMLImageElement).parentElement!.innerHTML = `<span class="text-[10px] sm:text-xs font-bold text-muted-foreground">${match.awayTeam.short}</span>`;
                                    }}
                                />
                            ) : (
                                <span className="text-[10px] sm:text-xs font-bold text-muted-foreground">{match.awayTeam.short}</span>
                            )}
                        </div>
                    </div>
                </div>
            </CardContent>

            <CardContent className="p-5 pt-2 relative z-10 flex-shrink-0 border-t border-white/10 bg-white/[0.02]">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground group-hover:text-white transition-colors">
                        <Bot className="size-3.5 text-primary shrink-0" />
                        <span className="font-medium">{copy("Analyse par Betix AI")}</span>
                    </div>
                    <div className="relative group/btn p-[1px] rounded-lg overflow-hidden transition-all duration-500">
                        {/* Animated gradient border background */}
                        <div className="absolute inset-[-100%] animate-[spin_3s_linear_infinite]"
                            style={{
                                background: 'conic-gradient(from 90deg at 50% 50%, transparent 0%, transparent 50%, #9333ea 70%, #a855f7 100%)'
                            }}
                        />
                        {/* Outward Glow Blur Base (Static) */}
                        <div className="absolute inset-0 bg-blue-600/10 blur-sm group-hover/btn:bg-blue-600/30 transition-colors duration-500 rounded-lg" />

                        <Button
                            asChild
                            size="sm"
                            className={cn(
                                "h-full w-full rounded-[inherit] bg-neutral-950/90 backdrop-blur-sm border-transparent transition-all duration-500 px-4",
                                "relative z-10 hover:bg-neutral-950/80"
                            )}
                        >
                            <Link href={`/${locale}/dashboard/match/${match.id}?sport=${match.sport}`} className="gap-2 flex items-center">
                                <span className="font-bold text-[11px] uppercase tracking-wider text-white/50 group-hover/btn:text-white transition-colors">{copy("Voir l'analyse")}</span>
                                <Sparkles className="size-3.5 text-primary animate-pulse group-hover/btn:scale-110 transition-transform" />
                            </Link>
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card >
    );
}
