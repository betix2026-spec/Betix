"use client";

import { cn } from "@/lib/utils";
import { BrainCircuit, CheckCircle2, TrendingUp, AlertTriangle } from "lucide-react";
import { Prediction, KeyFactor } from "@/types/match";
import { useI18n } from "@/lib/use-i18n";

interface ConfidenceGaugeProps {
    prediction: Prediction;
}

export function ConfidenceGauge({ prediction }: ConfidenceGaugeProps) {
    const { copy } = useI18n();
    // Config colors based on level (The color signal)
    const levelConfigs: Record<string, { color: string, bg: string, glow: string }> = {
        safe: { color: "text-emerald-500", bg: "bg-emerald-500", glow: "shadow-emerald-500/20" },
        value: { color: "text-purple-500", bg: "bg-purple-500", glow: "shadow-purple-500/20" },
        risky: { color: "text-orange-500", bg: "bg-orange-500", glow: "shadow-orange-500/20" },
    };

    const levelConfig = levelConfigs[prediction.level] || { color: "text-primary", bg: "bg-primary", glow: "shadow-primary/20" };

    const radius = 50;
    const stroke = 8;
    const normalizedRadius = radius - stroke * 2;
    const circumference = normalizedRadius * 2 * Math.PI;
    const strokeDashoffset = circumference - (prediction.confidence / 100) * circumference;

    return (
        <div className="relative group p-6 sm:p-10 rounded-[2rem] bg-black/40 border border-white/10 backdrop-blur-xl overflow-hidden hover:border-white/20 transition-all duration-700">
            {/* Soft Ambient Background Glow */}
            <div className={cn("absolute -top-24 -right-24 size-64 rounded-full blur-[100px] opacity-10 transition-opacity group-hover:opacity-20", levelConfig.bg)} />

            <div className="relative z-10 flex flex-col md:flex-row items-center gap-10 md:gap-14">

                {/* 1. Precision Gauge */}
                <div className="relative size-36 sm:size-44 flex items-center justify-center shrink-0">
                    {/* SVG Progress Circle */}
                    <svg viewBox={`0 0 ${radius * 2} ${radius * 2}`} className="rotate-[-90deg] size-full drop-shadow-[0_0_15px_rgba(0,0,0,0.5)]">
                        {/* Background track */}
                        <circle
                            stroke="currentColor"
                            fill="transparent"
                            strokeWidth={stroke}
                            r={normalizedRadius}
                            cx={radius}
                            cy={radius}
                            className="text-white/5"
                        />
                        {/* Foreground progress */}
                        <circle
                            stroke="currentColor"
                            fill="transparent"
                            strokeWidth={stroke}
                            strokeDasharray={circumference + ' ' + circumference}
                            strokeDashoffset={strokeDashoffset}
                            strokeLinecap="round"
                            r={normalizedRadius}
                            cx={radius}
                            cy={radius}
                            className={cn(levelConfig.color, "transition-all duration-1000 ease-out drop-shadow-[0_0_8px_currentColor]")}
                        />
                    </svg>

                    {/* Content inside Gauge (Perfectly centered) */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <div className="flex flex-col items-center">
                            <span className={cn("text-4xl sm:text-5xl font-black tracking-tighter tabular-nums leading-none", levelConfig.color)}>
                                {prediction.confidence}%
                            </span>
                            <span className="text-[8px] sm:text-[9px] font-bold uppercase tracking-[0.2em] text-white/70 mt-1 leading-none">
                                Confiance
                            </span>
                        </div>
                    </div>
                </div>

                {/* 2. Analysis & Verdict */}
                <div className="flex-1 space-y-6 text-center md:text-left">
                    <div className="space-y-3">
                        {/* AI Badge Label */}
                        <div className="flex items-center justify-center md:justify-start gap-3">
                            <div className="flex items-center justify-center size-8 rounded-full bg-primary/10 border border-primary/20">
                                <BrainCircuit className="size-4 text-primary" />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-500">{copy("Verdict Intelligent")}</span>
                                <span className={cn("text-[11px] font-bold uppercase tracking-widest", levelConfig.color)}>{copy("Niveau")} : {copy(prediction.level)}</span>
                            </div>
                        </div>

                        {/* The Bet Title */}
                        <h3 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-none">
                            {prediction.bet}
                        </h3>

                        {/* The Content Analysis */}
                        <div className="text-base text-neutral-400 max-w-xl leading-relaxed font-medium">
                            {prediction.analysis}
                        </div>
                    </div>

                    {/* Indicators/Factors */}
                    <div className="flex flex-wrap gap-2.5 justify-center md:justify-start pt-2">
                        {prediction.keyFactors.map((factor: KeyFactor, i: number) => (
                            <div key={i} className="flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-white/[0.03] border border-white/5 text-xs font-bold text-neutral-300 hover:bg-white/[0.05] transition-colors">
                                {factor.impact === "positive" ? (
                                    <CheckCircle2 className="size-3.5 text-primary" />
                                ) : factor.impact === "negative" ? (
                                    <AlertTriangle className="size-3.5 text-red-500/60" />
                                ) : (
                                    <TrendingUp className="size-3.5 text-neutral-600" />
                                )}
                                <span>{factor.text}</span>
                            </div>
                        ))}
                    </div>
                </div>

            </div>
        </div>
    );
}
