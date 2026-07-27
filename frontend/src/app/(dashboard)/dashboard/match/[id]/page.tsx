"use client";

import { use, useState, useEffect } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Match, Prediction } from "@/types/match";
import { getAiAuditForMatch } from "@/app/actions/match";
import { MatchHero } from "@/components/dashboard/analysis/MatchHero";
import { StatBattle } from "@/components/dashboard/analysis/StatBattle";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ArrowLeft, TrendingUp, Trophy, Activity, Users, Sparkles, ChevronDown, ChevronUp, Plus, Clock } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { PremiumGate } from "@/components/dashboard/PremiumGate";
import { BreathingGauge } from "@/components/ui/breathing-gauge";
import { useI18n } from "@/lib/use-i18n";
import { localizeAnalysisText } from "@/lib/i18n";

function VerdictSection({ summary }: { summary: string }) {
    const { copy } = useI18n();
    const [isExpanded, setIsExpanded] = useState(false);

    // Trim the text for flash mode.
    const flashText = summary.length > 150 ? summary.substring(0, 150) + "..." : summary;

    return (
        <div className="space-y-4 sm:space-y-6">
            <div className="flex flex-col gap-1">
                <h3 className="text-[10px] sm:text-[12px] font-montserrat font-black uppercase tracking-[0.1em] sm:tracking-[0.2em] text-primary drop-shadow-[0_0_8px_rgba(255,255,255,0.3)] leading-snug">{copy("VERDICT DE L'IA")}</h3>
                <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold text-primary/60 uppercase tracking-widest">{copy("Analyse Synthétique")}</span>
                </div>
            </div>

            <div className="p-7 rounded-xl bg-zinc-950/40 border border-white/5 relative overflow-hidden group hover:border-white/10 transition-all duration-700 shadow-2xl">
                {/* Ambient glow */}
                <div className="absolute -right-20 -top-20 size-64 bg-primary/5 blur-[100px] rounded-full opacity-30 pointer-events-none group-hover:bg-primary/10 transition-colors duration-700" />

                <div className="flex flex-col gap-6 z-10 relative">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                                <Sparkles className="size-4" />
                            </div>
                            <span className="text-[11px] font-bold text-white/60">{copy("Analyse de l'algorithme")}</span>
                        </div>
                        {summary.length > 150 && (
                            <button
                                onClick={() => setIsExpanded(!isExpanded)}
                                className="text-[10px] font-bold uppercase tracking-widest text-primary/60 hover:text-primary transition-colors flex items-center gap-1"
                            >
                                {isExpanded ? copy("Réduire") : copy("Développer l'analyse")}
                                {isExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                            </button>
                        )}
                    </div>

                    <p className={cn(
                        "text-[16px] leading-relaxed text-zinc-400 font-medium transition-all duration-500",
                        isExpanded ? "text-zinc-200" : "text-zinc-400"
                    )}>
                        {isExpanded ? summary : flashText}
                    </p>
                </div>
            </div>
        </div>
    );
}

export default function MatchAnalysisPage({ params }: { params: Promise<{ id: string }> }) {
    const { copy, t, locale } = useI18n();
    // Unwrap params using React.use()
    const resolvedParams = use(params);
    const [match, setMatch] = useState<Match | null>(null);
    const [loading, setLoading] = useState(true);
    const supabase = createClient();

    useEffect(() => {
        async function fetchData() {
            setLoading(true);

            // 1. Fetch match basic info
            const { data: matchData } = await supabase
                .from('matches')
                .select('*')
                .eq('id', resolvedParams.id)
                .single();

            if (matchData) {
                // 2. Fetch AI audit data using Server Action (bypasses RLS)
                const auditData = await getAiAuditForMatch(matchData.api_sport_id, matchData.sport);

                const dateObj = new Date(matchData.date_time);

                // Parse predictions from audit analysis if available
                let aiPredictions: Prediction[] = [];
                let parsedOdds: Record<string, any> = {};
                let aiSummaryText: string | undefined;

                if (auditData?.odds) {
                    parsedOdds = typeof auditData.odds === 'string' ? JSON.parse(auditData.odds) : auditData.odds;
                }

                if (auditData?.ai_analysis) {
                    const analysis = typeof auditData.ai_analysis === 'string' ? JSON.parse(auditData.ai_analysis) : auditData.ai_analysis;

                    // Parse categories from the AI audit.
                    const categories = analysis.categories || {};

                    const processCategory = (items: any[], level: "safe" | "value" | "risky") => {
                        if (!Array.isArray(items)) return;
                        items.forEach((item: any) => {
                            aiPredictions.push({
                                type: item.market ? localizeAnalysisText(item.market, locale) : "",
                                bet: item.selection ? localizeAnalysisText(item.selection, locale) : "",
                                odds: item.odds || 0,
                                bookmaker: item.bookmaker || item.provider || "Standard",
                                confidence: item.confidence_score || item.confidence || (level === "safe" ? 85 : level === "value" ? 65 : 45),
                                level: level,
                                rank: item.rank || 1,
                                analysis: item.analysis ? localizeAnalysisText(item.analysis, locale) : copy("Aucune analyse détaillée fournie."),
                                keyFactors: []
                            });
                        });
                    };

                    processCategory(categories.high_confidence, "safe");
                    processCategory(categories.medium_confidence, "value");
                    processCategory(categories.risky, "risky");

                    const rawSummary = analysis.match_summary || analysis.summary;
                    aiSummaryText = rawSummary ? localizeAnalysisText(rawSummary, locale) : undefined;
                }

                const transformed: Match = {
                    id: matchData.id,
                    sport: matchData.sport,
                    league: {
                        name: matchData.league_name,
                        country: "International"
                    },
                    homeTeam: {
                        id: matchData.home_team.id,
                        name: matchData.home_team.name,
                        short: matchData.home_team.code || matchData.home_team.name.substring(0, 3).toUpperCase(),
                        logo: matchData.home_team.logo
                    },
                    awayTeam: {
                        id: matchData.away_team.id,
                        name: matchData.away_team.name,
                        short: matchData.away_team.code || matchData.away_team.name.substring(0, 3).toUpperCase(),
                        logo: matchData.away_team.logo
                    },
                    date: dateObj.toISOString().split('T')[0],
                    time: dateObj.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
                    status: matchData.status,
                    statusShort: matchData.status_short,
                    homeScore: matchData.score?.home,
                    awayScore: matchData.score?.away,
                    scoreDisplay: matchData.score?.display,
                    scoreDetails: matchData.score?.details,
                    venue: matchData.venue || t("genericVenueFallback"),
                    predictions: aiPredictions,
                    aiSummary: aiSummaryText || (aiPredictions.length > 0 ? copy("Le modèle d'intelligence artificielle a analysé l'historique de performances, les expected goals (xG), la dynamique de possession et le différentiel de classement (ELO) pour proposer des verdicts mesurés sur cette rencontre. Retrouvez le détail de l'analyse ci-dessous.") : undefined),
                    aiAudit: auditData ? {
                        snapshot_at: auditData.snapshot_at,
                        odds: auditData.odds,
                        h2h: auditData.h2h,
                        rolling_stats: auditData.rolling_stats,
                        ai_analysis: auditData.ai_analysis,
                        locked: (auditData as any).locked
                    } : undefined
                };
                setMatch(transformed);
            }
            setLoading(false);
        }
        if (resolvedParams.id) {
            fetchData();
        }
    }, [copy, t, locale, resolvedParams.id, supabase]);

    // Initial loading state for animation
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
    }, []);

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center text-white/50">{copy("Chargement de l'analyse...")}</div>;
    }

    if (!match) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-4">
                <h1 className="text-2xl font-bold text-white">{copy("Match introuvable")}</h1>
                <Link href={`/${locale}/dashboard`}>
                    <Button variant="outline">{copy("Retour au tableau de bord")}</Button>
                </Link>
            </div>
        );
    }

    // Extraction des stats réelles de l'audit
    const auditStats = match.aiAudit?.rolling_stats;
    const homeStats = auditStats?.home || {};
    const awayStats = auditStats?.away || {};

    return (
        <div className={`space-y-6 sm:space-y-8 animate-fade-in pb-20 transition-opacity duration-700 ${mounted ? "opacity-100" : "opacity-0"}`}>

            {/* Back Navigation */}
            <button
                onClick={() => {
                    if (window.history.state && window.history.state.idx > 0) {
                        window.history.back();
                    } else {
                        // Fallback in case there is no history
                        window.location.href = '/dashboard' + (match.sport ? `?sport=${match.sport}` : '');
                    }
                }}
                className="inline-flex items-center gap-2 text-muted-foreground hover:text-white transition-colors group"
            >
                <ArrowLeft className="size-4 group-hover:-translate-x-1 transition-transform" />
                <span>{copy("Retour aux matchs")}</span>
            </button>

            {/* 1. HERO SECTION (The Stadium) */}
            <MatchHero match={match} />

            {/* 2. MAIN CONTENT */}
            {match.status === "live" ? (
                /* ═══════════════════════════════════════════════════
                   LIVE STATE — Full-width immersive placeholder
                   ═══════════════════════════════════════════════════ */
                <div className="relative w-full rounded-[2rem] overflow-hidden border border-white/5 bg-black/40 backdrop-blur-xl shadow-2xl animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
                    {/* Animated background layers */}
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-red-500/5" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[500px] bg-primary/10 rounded-full blur-[150px] animate-pulse" />
                    <div className="absolute top-0 right-0 size-[300px] bg-red-500/5 rounded-full blur-[120px]" />
                    <div className="absolute bottom-0 left-0 size-[200px] bg-blue-500/5 rounded-full blur-[100px]" />

                    {/* Animated horizontal scan line */}
                    <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent animate-pulse" style={{ top: '30%' }} />
                    <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-red-500/20 to-transparent animate-pulse" style={{ top: '70%', animationDelay: '1s' }} />

                    {/* Content */}
                    <div className="relative z-10 flex flex-col items-center justify-center text-center py-24 sm:py-32 lg:py-40 px-6 space-y-8">

                        {/* Animated pulse rings + icon */}
                        <div className="relative">
                            {/* Outer ring */}
                            <div className="absolute inset-0 -m-8 rounded-full border border-primary/10 animate-ping" style={{ animationDuration: '3s' }} />
                            {/* Middle ring */}
                            <div className="absolute inset-0 -m-4 rounded-full border border-primary/20 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }} />
                            {/* Icon container */}
                            <div className="relative p-6 rounded-full bg-gradient-to-br from-primary/20 to-red-500/10 border border-primary/30 shadow-[0_0_60px_rgba(var(--primary-rgb,124,58,237),0.3)]">
                                <Activity className="size-12 sm:size-14 text-primary drop-shadow-[0_0_20px_rgba(var(--primary-rgb,124,58,237),0.5)]" />
                                <Sparkles className="absolute -top-2 -right-2 size-6 text-primary animate-bounce" />
                                {/* Live dot */}
                                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/30 backdrop-blur-sm">
                                    <div className="size-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                                    <span className="text-[9px] font-black text-red-400 uppercase tracking-[0.2em]">{copy("Live")}</span>
                                </div>
                            </div>
                        </div>

                        {/* Title */}
                        <div className="space-y-4 max-w-2xl">
                            <h3 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-white/50 uppercase leading-tight">
                                {copy("Analyse Live")}
                                <br />
                                <span className="text-primary/80">{copy("Bientôt Disponible")}</span>
                            </h3>
                            <p className="text-sm sm:text-base text-zinc-500 font-medium max-w-lg mx-auto leading-relaxed">
                                {copy("Nos algorithmes de prédiction en temps réel sont en cours de développement. Vous serez les premiers à bénéficier des analyses live pour saisir les meilleures opportunités pendant le match.")}
                            </p>
                        </div>

                        {/* Feature pills */}
                        <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
                            {[
                                { icon: Activity, label: copy("Données temps réel") },
                                { icon: TrendingUp, label: copy("Cotes dynamiques") },
                                { icon: Sparkles, label: copy("IA prédictive") },
                            ].map(({ icon: Icon, label }) => (
                                <div key={label} className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.03] border border-white/10 text-xs font-medium text-zinc-400">
                                    <Icon className="size-3.5 text-primary/60" />
                                    {label}
                                </div>
                            ))}
                        </div>

                        {/* Simulated data stream (decorative) */}
                        <div className="w-full max-w-md pt-6 opacity-30">
                            <div className="flex items-center gap-2 justify-center">
                                {Array.from({ length: 12 }).map((_, i) => (
                                    <div
                                        key={i}
                                        className="w-1.5 bg-primary/40 rounded-full animate-pulse"
                                        style={{
                                            height: `${12 + Math.sin(i * 0.8) * 10}px`,
                                            animationDelay: `${i * 0.15}s`,
                                            animationDuration: '1.5s',
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                /* ═══════════════════════════════════════════════════
                   NORMAL STATE — 2-column Analysis + H2H/Stats grid
                   ═══════════════════════════════════════════════════ */
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">

                    {/* LEFT COLUMN (Analysis) - Spans 7 cols */}
                    <div className="lg:col-span-8 xl:col-span-9 space-y-6 sm:space-y-8 animate-in slide-in-from-bottom-8 duration-700 delay-300 flex flex-col relative before:absolute before:inset-0 before:bg-gradient-to-br before:from-primary/10 before:to-transparent before:blur-3xl before:-z-10">
                        <Card className="bg-zinc-950/40 border-white/5 backdrop-blur-md shadow-2xl rounded-xl overflow-hidden flex-1">
                            <CardHeader className="pb-4 sm:pb-6 border-b border-white/[0.03] bg-white/[0.01]">
                                <CardTitle className="text-[10px] sm:text-[12px] font-montserrat font-black uppercase tracking-[0.1em] sm:tracking-[0.2em] text-primary/80 flex items-center gap-2 leading-snug">
                                    <TrendingUp className="size-3.5 sm:size-4 text-primary shrink-0" />
                                    {copy("Intelligence Artificielle & Prédictions")}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-10 p-8 sm:p-10">
                                <PremiumGate isActive={!match.aiAudit?.locked}>
                                    {match.aiSummary && (
                                        <VerdictSection summary={match.aiSummary} />
                                    )}

                                    <div className="space-y-4 sm:space-y-6">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                            <h4 className="text-[10px] sm:text-[12px] font-montserrat font-black uppercase tracking-[0.1em] sm:tracking-[0.15em] text-primary/80 flex items-center gap-2 leading-relaxed">
                                                <Sparkles className="size-3.5 sm:size-4 text-primary shrink-0 mt-0.5 sm:mt-0" />
                                                <span>{copy("Ce que l’IA vous propose pour cette rencontre")}</span>
                                            </h4>

                                            <Sheet>
                                                <SheetTrigger asChild>
                                                    <Button variant="ghost" size="sm" className="text-[10px] uppercase font-black tracking-widest text-primary/60 hover:text-primary hover:bg-primary/5 gap-2 group">
                                                        {copy("Voir plus de paris")}
                                                        <Plus className="size-3 group-hover:rotate-90 transition-transform duration-300" />
                                                    </Button>
                                                </SheetTrigger>
                                                <SheetContent className="bg-zinc-950 border-l border-white/5 text-white w-full sm:max-w-md p-0 overflow-hidden flex flex-col">
                                                    <SheetHeader className="p-8 border-b border-white/5 bg-white/[0.02]">
                                                        <SheetTitle className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                                                            <TrendingUp className="size-5 text-primary" />
                                                            {copy("Explorateur de Paris IA")}
                                                        </SheetTitle>
                                                        <SheetDescription className="text-zinc-500 text-xs font-medium">
                                                            {copy("Retrouvez l'intégralité des analyses et opportunités identifiées par notre algorithme.")}
                                                        </SheetDescription>
                                                    </SheetHeader>
                                                    <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                                                        {match.predictions?.filter(p => p.rank !== 1).sort((a, b) => (a.rank || 0) - (b.rank || 0)).map((pred, idx) => (
                                                            <Dialog key={`sheet-${idx}`}>
                                                                <DialogTrigger asChild>
                                                                    <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] hover:border-white/10 transition-all cursor-pointer group">
                                                                        <div className="flex justify-between items-start mb-3">
                                                                            <div className={cn(
                                                                                "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest",
                                                                                pred.level === "safe" ? "bg-emerald-500/10 text-emerald-500" :
                                                                                    pred.level === "value" ? "bg-blue-500/10 text-blue-500" :
                                                                                        "bg-rose-500/10 text-rose-500"
                                                                            )}>
                                                                                {pred.level}
                                                                            </div>
                                                                            <span className="text-lg font-black font-mono text-primary italic">
                                                                                {pred.odds.toFixed(2)}
                                                                            </span>
                                                                        </div>
                                                                        <div className="text-sm font-bold text-white group-hover:text-primary transition-colors">
                                                                            {pred.bet}
                                                                        </div>
                                                                        <div className="text-[10px] text-white/30 uppercase font-bold tracking-widest mt-1">
                                                                            {pred.type}
                                                                        </div>
                                                                    </div>
                                                                </DialogTrigger>
                                                                <DialogContent className="sm:max-w-xl bg-zinc-950 border border-white/5 text-white shadow-2xl rounded-2xl overflow-hidden p-0 gap-0">
                                                                    <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />

                                                                    {/* Decorative Background Glow based on level inside modal */}
                                                                    <div className={cn(
                                                                        "absolute -top-32 -right-32 size-64 blur-[80px] rounded-full opacity-20 pointer-events-none",
                                                                        pred.level === "safe" ? "bg-emerald-500" :
                                                                            pred.level === "value" ? "bg-blue-500" :
                                                                                "bg-rose-500"
                                                                    )} />

                                                                    <DialogHeader className="space-y-4 p-6 sm:p-8 pb-6 border-b border-white/5 relative z-10">
                                                                        <div className="flex items-center justify-between">
                                                                            <div className="flex items-center gap-3">
                                                                                <div className={cn(
                                                                                    "px-3 py-1.5 rounded-lg border flex items-center gap-1.5 shadow-sm backdrop-blur-md",
                                                                                    pred.level === "safe" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                                                                                        pred.level === "value" ? "bg-blue-500/10 border-blue-500/20 text-blue-400" :
                                                                                            "bg-rose-500/10 border-rose-500/20 text-rose-400"
                                                                                )}>
                                                                                    <span className="shrink-0 size-1.5 rounded-full bg-current opacity-80" />
                                                                                    <span className="text-[10px] font-bold uppercase tracking-widest">{pred.level}</span>
                                                                                </div>
                                                                                {pred.bookmaker && (
                                                                                    <div className="px-2.5 py-1 rounded border border-white/5 bg-black/20 text-[10px] font-black text-white/50 uppercase tracking-widest">
                                                                                        {pred.bookmaker}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                            <div className="flex items-baseline gap-1.5">
                                                                                <span className="text-[10px] font-black text-white/20 tracking-widest">{copy("COTE")}</span>
                                                                                <span className="text-[20px] font-black tracking-tighter text-white font-mono">
                                                                                    {pred.odds.toFixed(2)}
                                                                                </span>
                                                                            </div>
                                                                        </div>

                                                                        <div className="space-y-2 pt-2">
                                                                            <DialogTitle asChild>
                                                                                <div className={cn(
                                                                                    "text-[32px] sm:text-[40px] font-black leading-[1] tracking-tight drop-shadow-lg",
                                                                                    "text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-white/70"
                                                                                )}>
                                                                                    {pred.bet}
                                                                                </div>
                                                                            </DialogTitle>
                                                                            <DialogDescription className="text-xs font-bold text-primary/70 uppercase tracking-[0.2em] flex items-center gap-2">
                                                                                <TrendingUp className="size-3.5" />
                                                                                {copy("Marché")} : {pred.type}
                                                                            </DialogDescription>
                                                                        </div>
                                                                    </DialogHeader>

                                                                    <div className="p-6 sm:p-8 pt-6 relative z-10">
                                                                        <div className="prose prose-invert prose-p:leading-relaxed prose-p:text-[15px] prose-p:text-zinc-300 prose-strong:text-white max-w-none">
                                                                            <p>{pred.analysis || copy("Le modèle n'a pas généré d'argumentaire détaillé pour cette sélection spécifique, mais a identifié un motif statistique favorable basé sur les historiques récents et la modélisation ELO.")}</p>
                                                                        </div>
                                                                    </div>
                                                                </DialogContent>
                                                            </Dialog>
                                                        ))}
                                                    </div>
                                                </SheetContent>
                                            </Sheet>
                                        </div>

                                        <div className="w-full">
                                            {(!match.predictions || match.predictions.length === 0) ? (
                                                <div className="relative w-full rounded-2xl overflow-hidden border border-white/5 bg-gradient-to-br from-zinc-900/60 via-black/40 to-zinc-900/60">
                                                    {/* Subtle background glow */}
                                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[200px] bg-primary/5 rounded-full blur-[80px]" />

                                                    <div className="relative z-10 flex flex-col items-center justify-center text-center py-16 sm:py-20 px-6 space-y-5">
                                                        {/* Icon */}
                                                        <div className="p-4 rounded-full bg-white/[0.03] border border-white/10">
                                                            <Clock className="size-7 text-zinc-500" />
                                                        </div>

                                                        {/* Message */}
                                                        <div className="space-y-2 max-w-md">
                                                            <h4 className="text-lg font-bold text-zinc-300 tracking-tight">
                                                                {copy("Analyse en préparation")}
                                                            </h4>
                                                            <p className="text-sm text-zinc-600 leading-relaxed">
                                                                {copy("L'analyse de ce match sera bientôt disponible. Nos algorithmes collectent les données nécessaires pour vous proposer les meilleures recommandations.")}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                (() => {
                                                    const topPredictions = match.predictions?.filter(p => p.rank === 1 && p.level).sort((a, b) => (a.level === 'safe' ? -1 : a.level === 'value' && b.level !== 'safe' ? -1 : 1)) || [];
                                                    if (topPredictions.length === 0) return null;

                                                    const safePred = topPredictions.find(p => p.level === "safe");
                                                    const valuePred = topPredictions.find(p => p.level === "value");
                                                    const riskyPred = topPredictions.find(p => p.level === "risky");
                                                    const defaultTab = safePred ? "safe" : valuePred ? "value" : riskyPred ? "risky" : topPredictions[0].level;

                                                    return (
                                                        <Tabs defaultValue={defaultTab} className="mt-8">
                                                            <div className="flex justify-center mb-10 w-full overflow-x-auto pb-2 custom-scrollbar">
                                                                <TabsList className="flex flex-nowrap items-center justify-center bg-black/40 border border-white/10 p-1.5 rounded-full gap-2 backdrop-blur-md h-auto shrink-0 w-max">
                                                                    {safePred && (
                                                                        <TabsTrigger value="safe" className="rounded-full px-6 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-400 data-[state=active]:border data-[state=active]:border-emerald-500/50 data-[state=active]:shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                                                                            Safe
                                                                        </TabsTrigger>
                                                                    )}
                                                                    {valuePred && (
                                                                        <TabsTrigger value="value" className="rounded-full px-6 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-400 data-[state=active]:border data-[state=active]:border-blue-500/50 data-[state=active]:shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                                                                            Value
                                                                        </TabsTrigger>
                                                                    )}
                                                                    {riskyPred && (
                                                                        <TabsTrigger value="risky" className="rounded-full px-6 py-2.5 text-sm font-medium transition-all data-[state=active]:bg-rose-500/20 data-[state=active]:text-rose-400 data-[state=active]:border data-[state=active]:border-rose-500/50 data-[state=active]:shadow-[0_0_15px_rgba(244,63,94,0.3)]">
                                                                            Risky
                                                                        </TabsTrigger>
                                                                    )}
                                                                </TabsList>
                                                            </div>

                                                            {topPredictions.map((pred) => {
                                                                const pct = typeof pred.confidence === 'number' ? pred.confidence : 0;
                                                                const outcome = pred.bet;
                                                                const odds = pred.odds.toFixed(2);
                                                                const analysis = pred.analysis || copy("Le modèle n'a pas généré d'argumentaire détaillé pour cette sélection spécifique, mais a identifié un motif statistique favorable basé sur les historiques récents et la modélisation ELO.");

                                                                return (
                                                                    <TabsContent key={pred.level} value={pred.level} className="mt-0 animate-fade-in shadow-none">
                                                                        <div className="flex flex-col md:flex-row items-center justify-center gap-12 md:gap-20 bg-gradient-to-b from-zinc-900/40 to-black/60 p-8 sm:p-12 rounded-3xl border border-white/10 ring-1 ring-white/5 shadow-2xl relative overflow-hidden flex-1 backdrop-blur-md">
                                                                            {/* Background Glow */}
                                                                            <div className={cn(
                                                                                "absolute top-1/2 left-1/4 -translate-y-1/2 size-64 blur-[80px] rounded-full opacity-10 pointer-events-none",
                                                                                pred.level === "safe" ? "bg-emerald-500" :
                                                                                    pred.level === "value" ? "bg-blue-500" :
                                                                                        "bg-rose-500"
                                                                            )} />

                                                                            {/* Gauge */}
                                                                            <div className="shrink-0 scale-125 md:scale-150 py-8 md:pl-8 relative z-10 w-[120px] flex justify-center">
                                                                                <BreathingGauge value={pct} label={t("aiConfidenceLabel")} />
                                                                            </div>

                                                                            {/* Content */}
                                                                            <div className="flex-1 text-center md:text-left space-y-5 max-w-lg relative z-10">
                                                                                <div>
                                                                                    <div className="flex items-center gap-2 mb-3 justify-center md:justify-start">
                                                                                        <div className={cn(
                                                                                            "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border flex items-center gap-1.5 shadow-sm backdrop-blur-md",
                                                                                            pred.level === "safe" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                                                                                                pred.level === "value" ? "bg-blue-500/10 border-blue-500/20 text-blue-400" :
                                                                                                    "bg-rose-500/10 border-rose-500/20 text-rose-400"
                                                                                        )}>
                                                                                            <span className="shrink-0 size-1.5 rounded-full bg-current opacity-80" />
                                                                                            {pred.level}
                                                                                        </div>
                                                                                        <span className="text-[10px] uppercase font-bold text-white/40 tracking-widest">{pred.type}</span>
                                                                                    </div>
                                                                                    <h3 className="text-4xl sm:text-5xl font-black mb-4 text-white leading-tight drop-shadow-md">{outcome}</h3>
                                                                                    <div className="inline-flex items-center px-4 py-1.5 rounded-full border border-white/10 bg-white/5 text-sm font-mono text-white/80">
                                                                                        {copy("Cote médiane")} : <span className="text-white ml-2 font-black">{odds}</span>
                                                                                    </div>
                                                                                </div>
                                                                                <p className="text-zinc-400 leading-relaxed text-[16px] sm:text-[18px]">
                                                                                    {analysis}
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                    </TabsContent>
                                                                )
                                                            })}
                                                        </Tabs>
                                                    );
                                                })()
                                            )}
                                        </div>
                                    </div>
                                </PremiumGate>
                            </CardContent>
                        </Card>
                    </div>

                    {/* RIGHT COLUMN (H2H & Stats) - Spans 5 cols */}
                    <div className="lg:col-span-4 xl:col-span-3 space-y-4 sm:space-y-5 animate-in slide-in-from-bottom-8 duration-700 delay-500 flex flex-col">
                        {/* TOP: H2H temporarily disabled for basketball and tennis. */}
                        {match.sport === 'football' && (
                        <Card className="bg-black/20 border-white/5 backdrop-blur-sm overflow-hidden relative opacity-90 transition-opacity hover:opacity-100">
                            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
                            <CardHeader className="border-b border-white/5 bg-white/[0.01] p-4">
                                <CardTitle className="text-sm font-medium flex items-center gap-2">
                                    <div className="p-1.5 rounded-md bg-blue-500/10 text-blue-400">
                                        <Trophy className="size-3.5" />
                                    </div>
                                    {copy("Face-à-Face Historique")}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6 pt-8 pb-10 px-8">
                                {(() => {
                                    const h2h = match.aiAudit?.h2h;
                                    const noH2H = !h2h || Object.keys(h2h).length === 0
                                        || h2h.summary === "No H2H found"
                                        || (typeof h2h.summary === 'object' && h2h.summary && Object.keys(h2h.summary).length === 0);
                                    if (noH2H) {
                                        return (
                                            <div className="py-12 flex items-center justify-center">
                                                <span className="text-sm text-zinc-600 font-medium">{copy("Pas encore disponible")}</span>
                                            </div>
                                        );
                                    }

                                    // Football uniquement dans ce bloc
                                    const homeId = match.homeTeam.id ?? h2h.home_team_id;
                                    const isHomeA = homeId != null && h2h.team_a_id === homeId;

                                    const homeWins = Number(isHomeA ? h2h.team_a_wins : h2h.team_b_wins) || 0;
                                    const awayWins = Number(!isHomeA ? h2h.team_a_wins : h2h.team_b_wins) || 0;
                                    const draws = Number(h2h.draws) || 0;
                                    const totalMatches = Number(h2h.total_matches || (homeWins + awayWins + draws)) || 1;

                                    if (totalMatches === 0) {
                                        return (
                                            <div className="py-16 text-center text-muted-foreground">{copy("Données H2H non disponibles.")}</div>
                                        );
                                    }

                                    return (
                                        <div className="space-y-12">
                                            {/* Jauge globale */}
                                            <div className="space-y-5">
                                                <div className="flex justify-between items-end text-sm font-medium">
                                                    <div className="flex flex-col items-start gap-1">
                                                        <span className="text-2xl font-bold text-white/80 drop-shadow-md">{homeWins}</span>
                                                        <span className="text-[10px] uppercase tracking-widest text-cyan-400 font-bold">{copy("Victoires")}</span>
                                                    </div>
                                                    <div className="flex flex-col items-center gap-1">
                                                        <span className="text-lg font-medium text-white/50">{draws > 0 ? draws : totalMatches}</span>
                                                        <span className="text-[10px] uppercase tracking-widest text-white/40">{draws > 0 ? copy('Nuls') : copy('Matchs')}</span>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-1">
                                                        <span className="text-2xl font-bold text-white/80 drop-shadow-md">{awayWins}</span>
                                                        <span className="text-[10px] uppercase tracking-widest text-rose-500 font-bold">{copy("Victoires")}</span>
                                                    </div>
                                                </div>

                                                {/* Barre H2H */}
                                                <div className="flex h-3 bg-white/[0.03] rounded-full overflow-hidden relative shadow-inner shadow-black/50 ring-1 ring-white/5">
                                                    {homeWins > 0 && (
                                                        <div
                                                            className="h-full bg-gradient-to-r from-cyan-500/80 to-blue-600/80 shadow-[0_0_10px_rgba(6,182,212,0.4)] z-10 relative flex items-center justify-end"
                                                            style={{ width: `${(homeWins / totalMatches) * 100}%` }}
                                                        >
                                                            <div className="absolute right-0 top-0 bottom-0 w-[4px] bg-white rounded-r-full shadow-[0_0_15px_rgba(255,255,255,0.9)]" />
                                                        </div>
                                                    )}
                                                    {draws > 0 && (
                                                        <div
                                                            className="h-full bg-white/10 z-10 border-x border-white/5"
                                                            style={{ width: `${(draws / totalMatches) * 100}%` }}
                                                        />
                                                    )}
                                                    {awayWins > 0 && (
                                                        <div
                                                            className="h-full bg-gradient-to-r from-rose-500/80 to-pink-500/80 shadow-[0_0_10px_rgba(244,63,94,0.4)] z-10 relative flex items-center justify-start"
                                                            style={{ width: `${(awayWins / totalMatches) * 100}%` }}
                                                        >
                                                            <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-white rounded-l-full shadow-[0_0_15px_rgba(255,255,255,0.9)]" />
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Moyennes de Buts */}
                                            {h2h.avg_goals_a !== undefined && (
                                                <div className="space-y-2 pt-6 border-t border-white/5">
                                                    <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-white/30 mb-8 text-center">{copy("Confrontations Moyennes")}</h4>
                                                    <StatBattle
                                                        label={copy("Buts Moyens")}
                                                        homeValue={Number(isHomeA ? h2h.avg_goals_a : h2h.avg_goals_b) || 0}
                                                        awayValue={Number(isHomeA ? h2h.avg_goals_b : h2h.avg_goals_a) || 0}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                            </CardContent>
                        </Card>
                        )}

                        {/* BOTTOM: Stats */}
                        <Card className="bg-black/20 border-white/5 backdrop-blur-sm overflow-hidden relative opacity-90 transition-opacity hover:opacity-100">
                            <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
                            <CardHeader className="border-b border-white/5 bg-white/[0.01] p-4">
                                <CardTitle className="text-sm font-medium flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                                            <Activity className="size-3.5" />
                                        </div>
                                        {copy("Comparatif des Tendances")}
                                    </div>
                                    <div className="flex flex-col items-end gap-0.5">
                                        <span className="text-[8px] font-black text-muted-foreground uppercase tracking-[0.2em]">{copy("Période")}</span>
                                        <span className="text-[10px] font-bold text-white/50 px-1.5 py-0.5 rounded bg-white/5 border border-white/10 uppercase tracking-widest">Rolling L5 / L10</span>
                                    </div>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6 pt-8 pb-10 px-8">
                                {Object.entries(homeStats).map(([key, value]) => {
                                    if (key === 'date') return null;
                                    // Human friendly labels for common stats
                                    const labels: Record<string, string> = {
                                        'l5_points': copy('Points Inscrits (L5)'),
                                        'l10_points': copy('Points Inscrits (L10)'),
                                        'l5_ortg': 'Offensive Rating (L5)',
                                        'l5_drtg': 'Defensive Rating (L5)',
                                        'l5_net_rtg': 'Net Rating (L5)',
                                        'l5_goals_for': copy('Buts marqués (L5)'),
                                        'l5_goals_against': copy('Buts encaissés (L5)'),
                                        'l5_xg_for': 'Ex. Goals For (L5)',
                                        'l5_xg_against': 'Ex. Goals Against (L5)',
                                        'l5_possession_avg': copy('Possession Moyenne'),
                                        'l10_aces_avg': copy('Aces Moy. (L10)'),
                                        'l10_first_serve_pct': copy('1er Service (L10)'),
                                        'l10_win_pct': 'Win Rate (L10)'
                                    };

                                    return (
                                        <StatBattle
                                            key={key}
                                            label={labels[key] || key.replace(/_/g, ' ').toUpperCase()}
                                            homeValue={parseFloat(String(value)) || 0}
                                            awayValue={parseFloat(String(awayStats[key])) || 0}
                                            showPercent={key.includes('pct') || key.includes('possession')}
                                        />
                                    );
                                })}
                                {Object.keys(homeStats).length === 0 && (
                                    <div className="py-12 flex items-center justify-center">
                                        <span className="text-sm text-zinc-600 font-medium">{copy("Pas encore disponible")}</span>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>

                </div>
            )}
        </div>
    );
}
