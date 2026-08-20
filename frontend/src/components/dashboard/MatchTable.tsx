"use client";

import { useRouter } from "next/navigation";
import { Match } from "@/types/match";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";
import { SportIcon } from "@/components/icons/SportIcons";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/use-i18n";
import { ConfidenceBadge } from "@/components/dashboard/ConfidenceBadge";

interface MatchTableProps {
    items: Match[];
}

export function MatchTable({ items }: MatchTableProps) {
    const { copy, locale } = useI18n();
    const router = useRouter();

    const goToMatch = (match: Match) => {
        router.push(`/${locale}/dashboard/match/${match.id}?sport=${match.sport}`);
    };

    return (
        <div className="rounded-xl border border-white/10 bg-black/40 backdrop-blur-xl overflow-hidden">
            <Table>
                <TableHeader className="bg-white/5 hover:bg-white/5">
                    <TableRow className="border-white/10 hover:bg-transparent">
                        {/* Time: Visible */}
                        <TableHead className="w-[80px] sm:w-[100px] text-xs uppercase tracking-wider font-semibold text-muted-foreground">{copy("Heure")}</TableHead>
                        {/* League: Hidden on mobile */}
                        <TableHead className="hidden md:table-cell w-[180px] text-xs uppercase tracking-wider font-semibold text-muted-foreground">{copy("Ligue")}</TableHead>
                        {/* Match: Visible - Expanded on mobile. Score is merged inline once the match has one. */}
                        <TableHead className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">{copy("Match")}</TableHead>
                        {/* Odds: Hidden on mobile. Home/away moneyline from the latest snapshot. */}
                        <TableHead className="hidden md:table-cell text-center w-[100px] text-xs uppercase tracking-wider font-semibold text-muted-foreground">{copy("Cote")}</TableHead>
                        {/* IA: Visible (compact mobile) */}
                        <TableHead className="w-[80px] md:w-[140px] text-xs uppercase tracking-wider font-semibold text-muted-foreground text-right md:text-left">{copy("Confiance")}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {items.map((match) => {
                        const isLive = match.status === "live";
                        const isFinished = match.status === "finished";
                        const topPrediction = match.predictions?.[0];

                        return (
                                <TableRow
                                    key={match.id}
                                    className="group border-white/5 hover:bg-white/5 transition-colors cursor-pointer"
                                    onClick={() => goToMatch(match)}
                                >
                                    {/* 1. Time / Status */}
                                    <TableCell className="font-mono text-xs sm:text-sm py-3 sm:py-4">
                                        {isLive ? (
                                            <span className="flex flex-col sm:flex-row items-center gap-1.5 text-red-500 font-bold animate-pulse">
                                                <Activity className="size-3" />
                                                <span className="text-[10px] sm:text-sm">{copy("LIVE")}</span>
                                            </span>
                                        ) : (
                                            <div className="flex flex-col gap-1">
                                                <span className="text-white font-medium group-hover:text-white transition-colors">
                                                    {match.time}
                                                </span>
                                                {match.status === "upcoming" && (
                                                    <Badge variant="outline" className="w-fit bg-blue-500/10 text-blue-400 border-blue-500/20 text-[9px] px-1 py-0 h-4 font-bold uppercase tracking-tighter">
                                                        Next
                                                    </Badge>
                                                )}
                                                {match.status === "imminent" && (
                                                    <Badge variant="outline" className="w-fit bg-amber-500/10 text-amber-500 border-amber-500/20 text-[9px] px-1 py-0 h-4 font-bold uppercase tracking-tighter animate-pulse">
                                                        Imminent
                                                    </Badge>
                                                )}
                                                <span className="text-[10px] text-muted-foreground md:hidden uppercase font-medium tracking-tighter">
                                                    {(() => {
                                                        const now = new Date();
                                                        const matchDateStr = match.date;
                                                        const todayStr = now.toISOString().split('T')[0];

                                                        const tomorrowDate = new Date(now);
                                                        tomorrowDate.setDate(now.getDate() + 1);
                                                        const tomorrowStr = tomorrowDate.toISOString().split('T')[0];

                                                        if (matchDateStr === todayStr) return copy("Aujourd'hui");
                                                        if (matchDateStr === tomorrowStr) return copy("Demain");
                                                        const shortDateLocale = { fr: "fr-FR", en: "en-US", es: "es-ES", de: "de-DE" }[locale];
                                                        return new Date(matchDateStr).toLocaleDateString(shortDateLocale, { day: 'numeric', month: 'short' });
                                                    })()}
                                                </span>
                                            </div>
                                        )}
                                    </TableCell>

                                    {/* 2. League (Hidden Mobile) */}
                                    <TableCell className="hidden md:table-cell">
                                        <div className="flex items-center gap-2">
                                            <SportIcon sport={match.sport} size={14} className="text-muted-foreground" />
                                            <span className="text-sm font-medium text-muted-foreground truncate max-w-[140px]" title={match.league?.name}>
                                                {match.league?.name}
                                            </span>
                                        </div>
                                    </TableCell>

                                    {/* 3. Match (Teams + Score on Mobile) */}
                                    <TableCell className="py-2 sm:py-4">
                                        {/* Mobile Layout: Stacked Teams + Inline Scores */}
                                        <div className="flex flex-col md:hidden gap-1.5">
                                            {/* Home Row (Mobile) */}
                                            <div className="flex justify-between items-center pr-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <div className="size-6 rounded-full bg-neutral-900 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                                                        {match.homeTeam.logo ? (
                                                            <img src={match.homeTeam.logo} alt="" className="size-full object-contain p-1" />
                                                        ) : (
                                                            <span className="text-[8px] font-bold text-muted-foreground">{match.homeTeam.short}</span>
                                                        )}
                                                    </div>
                                                    <span className={cn("text-xs font-medium truncate", isLive && (match.homeScore ?? 0) > (match.awayScore ?? 0) ? "text-white" : "text-neutral-300")}>
                                                        {match.homeTeam.name}
                                                    </span>
                                                </div>
                                                {(isLive || isFinished) && match.sport !== "tennis" && (
                                                    <span className="font-mono text-xs font-bold text-white">{match.homeScore ?? 0}</span>
                                                )}
                                            </div>
                                            {/* Away Row (Mobile) */}
                                            <div className="flex justify-between items-center pr-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <div className="size-6 rounded-full bg-neutral-900 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                                                        {match.awayTeam.logo ? (
                                                            <img src={match.awayTeam.logo} alt="" className="size-full object-contain p-1" />
                                                        ) : (
                                                            <span className="text-[8px] font-bold text-muted-foreground">{match.awayTeam.short}</span>
                                                        )}
                                                    </div>
                                                    <span className={cn("text-xs font-medium truncate", isLive && (match.awayScore ?? 0) > (match.homeScore ?? 0) ? "text-white" : "text-neutral-300")}>
                                                        {match.awayTeam.name}
                                                    </span>
                                                </div>
                                                {(isLive || isFinished) && match.sport !== "tennis" && (
                                                    <span className="font-mono text-xs font-bold text-white">{match.awayScore ?? 0}</span>
                                                )}
                                            </div>
                                            {/* Tennis Score (Mobile) */}
                                            {(isLive || isFinished) && match.sport === "tennis" && match.scoreDisplay && (
                                                <div className="text-[10px] font-mono font-bold text-white text-center bg-white/5 rounded px-2 py-0.5 mt-0.5">
                                                    {match.scoreDisplay}
                                                </div>
                                            )}
                                            {/* League Hint (Mobile) */}
                                            <div className="flex items-center gap-1 mt-0.5 text-[10px] text-neutral-500">
                                                <SportIcon sport={match.sport} size={10} />
                                                <span className="truncate max-w-[180px]">{match.league?.name}</span>
                                            </div>
                                        </div>

                                        {/* Desktop Layout: Side by Side */}
                                        <div className="hidden md:flex items-center gap-4">
                                            <div className="flex items-center gap-3 flex-1 justify-end">
                                                <span className={cn("text-sm font-medium text-right", isLive && (match.homeScore ?? 0) > (match.awayScore ?? 0) ? "text-white" : "text-neutral-400")}>{match.homeTeam.name}</span>
                                                <div className="size-10 rounded-full bg-neutral-900 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                                                    {match.homeTeam.logo ? (
                                                        <img src={match.homeTeam.logo} alt="" className="size-full object-contain p-1.5" />
                                                    ) : (
                                                        <span className="text-[12px] font-bold text-muted-foreground">{match.homeTeam.short}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <span className={cn("text-xs font-mono shrink-0", (isLive || isFinished) ? "text-white font-bold text-sm" : "text-muted-foreground")}>
                                                {isLive || isFinished
                                                    ? (match.sport === "tennis" && match.scoreDisplay
                                                        ? match.scoreDisplay
                                                        : `${match.homeScore ?? 0}:${match.awayScore ?? 0}`)
                                                    : copy("vs")}
                                            </span>
                                            <div className="flex items-center gap-3 flex-1">
                                                <div className="size-10 rounded-full bg-neutral-900 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                                                    {match.awayTeam.logo ? (
                                                        <img src={match.awayTeam.logo} alt="" className="size-full object-contain p-1.5" />
                                                    ) : (
                                                        <span className="text-[12px] font-bold text-muted-foreground">{match.awayTeam.short}</span>
                                                    )}
                                                </div>
                                                <span className={cn("text-sm font-medium", isLive && (match.awayScore ?? 0) > (match.homeScore ?? 0) ? "text-white" : "text-neutral-400")}>{match.awayTeam.name}</span>
                                            </div>
                                        </div>
                                    </TableCell>

                                    {/* 4. Odds (Desktop Only) — home/away moneyline from the latest snapshot */}
                                    <TableCell className="hidden md:table-cell text-center text-xs font-mono text-neutral-300">
                                        {match.marketTeaser?.homeOdds != null && match.marketTeaser?.awayOdds != null
                                            ? `${match.marketTeaser.homeOdds.toFixed(2)} / ${match.marketTeaser.awayOdds.toFixed(2)}`
                                            : <span className="text-muted-foreground">-</span>}
                                    </TableCell>

                                    {/* 5. AI Confidence */}
                                    <TableCell className="text-right md:text-left">
                                        <ConfidenceBadge
                                            badge={match.confidenceBadge}
                                            topPrediction={topPrediction}
                                            marketTeaser={match.marketTeaser}
                                            homeTeamShort={match.homeTeam.short}
                                            awayTeamShort={match.awayTeam.short}
                                        />
                                    </TableCell>

                                </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}
