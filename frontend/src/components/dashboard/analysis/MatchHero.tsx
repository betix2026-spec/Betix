"use client";

import { Match } from "@/types/match";
import { Badge } from "@/components/ui/badge";
import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { SportIcon } from "@/components/icons/SportIcons";
import { useI18n } from "@/lib/use-i18n";

interface MatchHeroProps {
    match: Match;
}

export function MatchHero({ match }: MatchHeroProps) {
    const { locale } = useI18n();
    const isLive = match.status === "live";
    const dateLocale = { fr: "fr-FR", en: "en-US", es: "es-ES", de: "de-DE" }[locale];

    // Premium Dark Theme - Deep blue-black base for all sports
    const themeGradient = "from-neutral-900/80 via-black to-black";

    // Subtle sport accent color (barely visible, just for depth)
    const accentColor = match.sport === "football" ? "bg-emerald-500/5" : match.sport === "basketball" ? "bg-orange-500/5" : "bg-blue-500/5";

    return (
        <div className="relative w-full h-[320px] sm:h-[400px] overflow-hidden rounded-[2.5rem] border border-white/5 shadow-2xl bg-black">

            {/* 1. Base Gradient */}
            <div className={cn("absolute inset-0 bg-gradient-to-b z-10", themeGradient)} />

            {/* 2. Subtle Sport Accent Glow (Restricted area) */}
            <div className={cn("absolute inset-x-0 top-0 h-1/2 blur-[120px] z-0", accentColor)} />

            {/* 3. Content Layer */}
            <div className="relative z-20 h-full flex flex-col items-center justify-between py-10 px-6 text-center">

                {/* Meta Header */}
                <div className="flex items-center gap-4 text-xs font-bold text-neutral-500 uppercase tracking-[0.3em] animate-in fade-in slide-in-from-top-4 duration-1000">
                    <div className="flex items-center gap-2">
                        <SportIcon sport={match.sport} size={14} className="text-primary/60" />
                        <span className="text-neutral-400">{match.league.name}</span>
                    </div>
                    <span className="opacity-20">•</span>
                    <div className="flex items-center gap-2">
                        <MapPin className="size-3.5" />
                        <span className="text-neutral-400">{match.venue}</span>
                    </div>
                </div>

                {/* Main Arena (Teams & Score) */}
                <div className="w-full max-w-5xl grid grid-cols-3 items-center gap-4 sm:gap-8">

                    {/* Home Team */}
                    <div className="flex flex-col items-center gap-4 sm:gap-6 group">
                        <div className="relative">
                            <div className={cn("absolute inset-0 bg-white/10 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700", match.sport === 'tennis' ? 'rounded-xl' : 'rounded-full')} />
                            <div className={cn(
                                "relative flex items-center justify-center bg-neutral-900/50 border border-white/10 shadow-2xl group-hover:scale-105 transition-all duration-500 backdrop-blur-sm overflow-hidden",
                                match.sport === 'tennis'
                                    ? 'size-28 sm:size-32 rounded-xl'
                                    : 'size-24 sm:size-32 rounded-full'
                            )}>
                                {match.homeTeam.logo ? (
                                    <img
                                        src={match.homeTeam.logo}
                                        alt={match.homeTeam.name}
                                        className={cn(
                                            "size-full drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]",
                                            match.sport === 'tennis' ? 'object-cover' : 'object-contain p-4 sm:p-6'
                                        )}
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none';
                                            const fallback = (e.target as HTMLImageElement).nextElementSibling as HTMLSpanElement;
                                            if (fallback) fallback.style.display = 'block';
                                        }}
                                    />
                                ) : null}
                                <span className={cn(
                                    "text-3xl sm:text-5xl font-black text-white drop-shadow-lg",
                                    match.homeTeam.logo ? "hidden" : "block"
                                )}>
                                    {match.homeTeam.short}
                                </span>
                            </div>
                        </div>
                        <h2 className="text-lg sm:text-2xl font-black text-white tracking-tight uppercase">{match.homeTeam.name}</h2>
                    </div>

                    {/* Score / VS Center */}
                    <div className="flex flex-col items-center justify-center">
                        {match.status === "upcoming" ? (
                            <div className="space-y-4">
                                <span className="text-5xl sm:text-8xl font-black text-neutral-800 tracking-tighter italic">
                                    VS
                                </span>
                                <div className="flex flex-col items-center gap-2">
                                    <Badge variant="outline" className="bg-primary/10 border-primary/30 text-primary font-bold px-4 py-1">
                                        {match.time}
                                    </Badge>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center gap-4">
                                {/* Tennis: text set score */}
                                {match.sport === "tennis" && match.scoreDisplay ? (
                                    <div className="text-3xl sm:text-5xl font-black text-white tracking-tight tabular-nums drop-shadow-[0_0_30px_rgba(255,255,255,0.2)] text-center leading-tight">
                                        {match.scoreDisplay}
                                    </div>
                                ) : (
                                    /* Football & Basketball: numeric */
                                    <div className="text-6xl sm:text-8xl font-black text-white tracking-tighter tabular-nums drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]">
                                        {match.homeScore ?? 0}<span className="text-neutral-700 mx-2 sm:mx-4">:</span>{match.awayScore ?? 0}
                                    </div>
                                )}
                                {isLive && (
                                    <Badge className="bg-red-500/10 text-red-500 border border-red-500/20 animate-pulse px-4 py-1 font-bold tracking-widest uppercase text-[10px]">
                                        Live • {match.statusShort || "0'"}
                                    </Badge>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Away Team */}
                    <div className="flex flex-col items-center gap-4 sm:gap-6 group">
                        <div className="relative">
                            <div className={cn("absolute inset-0 bg-white/10 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700", match.sport === 'tennis' ? 'rounded-xl' : 'rounded-full')} />
                            <div className={cn(
                                "relative flex items-center justify-center bg-neutral-900/50 border border-white/10 shadow-2xl group-hover:scale-105 transition-all duration-500 backdrop-blur-sm overflow-hidden",
                                match.sport === 'tennis'
                                    ? 'size-28 sm:size-32 rounded-xl'
                                    : 'size-24 sm:size-32 rounded-full'
                            )}>
                                {match.awayTeam.logo ? (
                                    <img
                                        src={match.awayTeam.logo}
                                        alt={match.awayTeam.name}
                                        className={cn(
                                            "size-full drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]",
                                            match.sport === 'tennis' ? 'object-cover' : 'object-contain p-4 sm:p-6'
                                        )}
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).style.display = 'none';
                                            const fallback = (e.target as HTMLImageElement).nextElementSibling as HTMLSpanElement;
                                            if (fallback) fallback.style.display = 'block';
                                        }}
                                    />
                                ) : null}
                                <span className={cn(
                                    "text-3xl sm:text-5xl font-black text-white drop-shadow-lg",
                                    match.awayTeam.logo ? "hidden" : "block"
                                )}>
                                    {match.awayTeam.short}
                                </span>
                            </div>
                        </div>
                        <h2 className="text-lg sm:text-2xl font-black text-white tracking-tight uppercase">{match.awayTeam.name}</h2>
                    </div>

                </div>

                {/* Footer Time */}
                <div className="text-[11px] sm:text-[13px] font-bold text-neutral-600 uppercase tracking-[0.4em] animate-in fade-in slide-in-from-bottom-4 duration-1000">
                    {new Date(match.date).toLocaleDateString(dateLocale, { weekday: 'long', day: 'numeric', month: 'long' })}
                </div>
            </div>
        </div>
    );
}
