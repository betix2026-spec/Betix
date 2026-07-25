"use client";

import { CareerStats } from "@/types/user";
import { cn } from "@/lib/utils";
import { TrendingUp, Target, Zap, Trophy, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/use-i18n";

interface StatsCenterProps {
    stats: CareerStats;
}

export function StatsCenter({ stats }: StatsCenterProps) {
    const { copy } = useI18n();
    const roiColor = stats.roi >= 0 ? "text-emerald-400" : "text-red-400";
    const roiBg = stats.roi >= 0 ? "bg-emerald-500/10" : "bg-red-500/10";
    const roiBorder = stats.roi >= 0 ? "border-emerald-500/20" : "border-red-500/20";

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-in slide-in-from-bottom-4 duration-700 delay-150">

            {/* 1. ROI Card (Main Metric) */}
            <Card className={cn("border backdrop-blur-md bg-black/40", roiBorder, roiBg)}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground">{copy("ROI Global")}</CardTitle>
                    <TrendingUp className={cn("size-4", roiColor)} />
                </CardHeader>
                <CardContent>
                    <div className={cn("text-3xl font-black tracking-tighter", roiColor)}>
                        {stats.roi > 0 ? "+" : ""}{stats.roi}%
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{copy("Retour sur investissement total")}</p>
                </CardContent>
            </Card>

            {/* 2. Win Rate */}
            <Card className="border-white/10 bg-black/40 backdrop-blur-md">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground">{copy("Taux de Victoire")}</CardTitle>
                    <Target className="size-4 text-blue-400" />
                </CardHeader>
                <CardContent>
                    <div className="text-3xl font-black tracking-tighter text-white">
                        {stats.winRate}%
                    </div>
                    <ProgressRing radius={15} stroke={3} progress={stats.winRate} className="hidden" /> {/* Placeholder for visual flair if needed */}
                    <p className="text-xs text-muted-foreground mt-1">{stats.wins}V - {stats.losses}D</p>
                </CardContent>
            </Card>

            {/* 3. Streaks */}
            <Card className="border-white/10 bg-black/40 backdrop-blur-md">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground">{copy("Série Record")}</CardTitle>
                    <Zap className="size-4 text-amber-400" />
                </CardHeader>
                <CardContent>
                    <div className="text-3xl font-black tracking-tighter text-white">
                        {stats.bestStreak} <span className="text-lg font-bold text-muted-foreground">{copy("Victoires")}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{copy("Actuelle")} : {stats.currentStreak > 0 ? `+${stats.currentStreak}` : stats.currentStreak}</p>
                </CardContent>
            </Card>

            {/* 4. Total Profit */}
            <Card className="border-white/10 bg-black/40 backdrop-blur-md">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium uppercase tracking-widest text-muted-foreground">{copy("Profit Total")}</CardTitle>
                    <DollarSign className="size-4 text-emerald-400" />
                </CardHeader>
                <CardContent>
                    <div className="text-3xl font-black tracking-tighter text-white">
                        {stats.totalProfit}€
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{copy("Cote moyenne")} : {stats.avgOdds}</p>
                </CardContent>
            </Card>
        </div>
    );
}

// Simple internal component for visual flair if I want to expand later
function ProgressRing({ radius, stroke, progress, className }: { radius: number, stroke: number, progress: number, className?: string }) {
    // ... implementation logic would go here
    return null;
}
