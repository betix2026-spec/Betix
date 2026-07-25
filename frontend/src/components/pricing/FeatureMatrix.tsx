"use client";

import { cn } from "@/lib/utils";
import { Check, Minus, Zap, Shield, Crown, Lock } from "lucide-react";
import { Plan, FeatureDefinition, PlanFeatures } from "@/types/plans";
import { useI18n } from "@/lib/use-i18n";
import { pickLocalized } from "@/lib/i18n";

interface FeatureMatrixProps {
    plans: Plan[];
    definitions: FeatureDefinition[];
}

export function FeatureMatrix({ plans, definitions }: FeatureMatrixProps) {
    const { t, locale } = useI18n();
    const planCount = plans.length;
    // Dynamic grid setup
    const gridStyle = {
        gridTemplateColumns: `repeat(${planCount + 1}, minmax(180px, 1fr))`
    };

    const categories: { key: keyof PlanFeatures; label: string }[] = [
        { key: "core", label: t("coreFeaturesCategory") },
        { key: "advanced", label: t("advancedFeaturesCategory") },
        { key: "vip", label: t("vipFeaturesCategory") }
    ];

    // Helper to get visual flavor for a plan
    const getPlanFlavor = (plan: Plan) => {
        const freq = plan.frequency;
        if (freq === 'free') return { color: "text-neutral-400", icon: null };
        if (freq === 'yearly') return { color: "text-amber-500", icon: <TrophyIcon /> };
        if (freq === 'monthly' || freq === 'weekly' || freq === 'daily') return { color: "text-blue-400", icon: <Crown className="size-4" /> };
        return { color: "text-blue-400", icon: <Zap className="size-4" /> };
    };

    // Helper to get feature value for a specific plan
    const getVal = (plan: Plan, category: keyof PlanFeatures, featId: string) => {
        const feat = plan.features?.[category]?.[featId];
        // Handle object structure { value: ... }
        if (typeof feat === 'object' && feat !== null && 'value' in (feat as any)) {
            return (feat as any).value;
        }
        // Return raw value or false if missing
        return feat !== undefined ? feat : false;
    };

    return (
        <div className="rounded-3xl border border-white/10 bg-black/40 overflow-x-auto no-scrollbar backdrop-blur-sm">
            <div className="grid min-w-[800px]" style={gridStyle}>
                {/* Header labels */}
                <div className="col-span-1 p-6 border-b border-white/10 bg-white/5 text-sm font-bold uppercase text-neutral-500 tracking-widest flex items-center">
                    {t("comparisonMatrixHeader")}
                </div>
                {plans.map((plan) => {
                    const flavor = getPlanFlavor(plan);
                    return (
                        <div key={plan.id} className="p-6 border-b border-white/10 bg-white/5 flex flex-col items-center justify-center gap-1 border-l border-white/5">
                            <div className={cn("font-black flex items-center gap-2 text-center", flavor.color)}>
                                {flavor.icon}
                                {pickLocalized(locale, plan.name, { en: plan.name_en, es: plan.name_es, de: plan.name_de })}
                            </div>
                        </div>
                    );
                })}

                {/* Matrix Body */}
                <div className="col-span-full divide-y divide-white/5">
                    {categories.map((cat) => {
                        // Collect ALL feature IDs used in this category across ALL active plans
                        const featIds = Array.from(new Set(
                            plans.flatMap(p => Object.keys(p.features?.[cat.key] || {}))
                        ));

                        if (featIds.length === 0) return null;

                        return (
                            <div key={cat.key}>
                                {/* Section Header */}
                                <div className="bg-white/[0.02] px-6 py-2 text-[10px] font-bold uppercase text-neutral-600 tracking-widest">
                                    {cat.label}
                                </div>

                                {/* Rows */}
                                {featIds.map((featId) => {
                                    const def = definitions.find(d => d.id === featId);
                                    const label = def
                                        ? pickLocalized(locale, def.label, { en: def.label_en, es: def.label_es, de: def.label_de })
                                        : featId;

                                    return (
                                        <div key={featId} className="grid hover:bg-white/5 transition-colors group" style={gridStyle}>
                                            <div className="col-span-1 px-6 py-4 text-sm font-medium text-neutral-300 flex items-center gap-2">
                                                {label}
                                            </div>

                                            {/* Columns */}
                                            {plans.map((plan) => {
                                                const val = getVal(plan, cat.key, featId);
                                                const flavor = getPlanFlavor(plan);
                                                const isHighlighted = plan.frequency === 'monthly';

                                                return (
                                                    <div
                                                        key={`${plan.id}-${featId}`}
                                                        className={cn(
                                                            "flex justify-center items-center text-sm font-mono transition-colors border-l border-white/5",
                                                            isHighlighted ? "bg-blue-500/5 group-hover:bg-blue-500/10" : ""
                                                        )}
                                                    >
                                                        {typeof val === 'boolean' ? (
                                                            val ? (
                                                                <Check className={cn("size-5", flavor.color)} />
                                                            ) : (
                                                                <Minus className="size-4 opacity-20 text-neutral-500" />
                                                            )
                                                        ) : (
                                                            <span className={cn("font-bold px-2 text-center", !val ? "opacity-20 text-neutral-500" : flavor.color)}>
                                                                {val || "—"}
                                                            </span>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function TrophyIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
        >
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
            <path d="M4 22h16" />
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
        </svg>
    )
}
