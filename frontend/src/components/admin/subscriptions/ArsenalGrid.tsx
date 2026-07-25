"use client";

import { Plan, FeatureDefinition } from "@/types/plans";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Star, Settings, Package, Shield, Zap, X, AlertTriangle } from "lucide-react";
import { getDisplayFeatures, getMonthlyEquivalent } from "@/lib/plans";
import { useI18n } from "@/lib/use-i18n";
import { pickLocalized } from "@/lib/i18n";

interface ArsenalGridProps {
    plans: Plan[];
    definitions: FeatureDefinition[];
    onEditPlan: (plan: Plan) => void;
}

export function ArsenalGrid({ plans, definitions, onEditPlan }: ArsenalGridProps) {
    const { copy, locale } = useI18n();

    if (plans.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 border border-dashed border-white/10 rounded-3xl bg-white/5 text-neutral-400">
                <AlertTriangle className="size-10 mb-4 text-amber-500" />
                <h3 className="text-xl font-bold text-white">{copy("Aucun plan créé")}</h3>
                <p>{copy("Initialisez la base de données ou vérifiez la connexion.")}</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-in slide-in-from-bottom-8 duration-700 delay-200">
            {plans.map((plan) => {
                const isPremium = plan.price > 0;
                const isYearly = plan.frequency === "yearly";

                // Theme Config
                const theme = isYearly
                    ? { border: "border-amber-500/50", bg: "bg-amber-500/5", glow: "shadow-[0_0_30px_-10px_rgba(245,158,11,0.3)]", icon: Star, iconColor: "text-amber-400" }
                    : isPremium
                        ? { border: "border-blue-500/50", bg: "bg-blue-500/5", glow: "shadow-[0_0_30px_-10px_rgba(59,130,246,0.3)]", icon: Zap, iconColor: "text-blue-400" }
                        : { border: "border-white/10", bg: "bg-white/5", glow: "", icon: Package, iconColor: "text-neutral-400" };

                const displayFeatures = getDisplayFeatures(plan, definitions, locale);

                return (
                    <div
                        key={plan.id}
                        className={cn(
                            "group relative flex flex-col rounded-[2rem] border-2 bg-black backdrop-blur-xl transition-all duration-500 hover:scale-[1.02]",
                            theme.border,
                            theme.glow
                        )}
                    >
                        {/* Holographic Header */}
                        <div className="relative p-8 pb-0 overflow-hidden rounded-t-[2rem]">
                            {/* Background Pattern */}
                            <div className={cn("absolute inset-0 opacity-20", theme.bg)} />
                            <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.05)_50%,transparent_75%)] bg-[length:250%_250%] animate-shimmer" />

                            <div className="relative z-10 flex justify-between items-start">
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <Badge variant="outline" className={cn("text-[10px] font-bold uppercase tracking-widest bg-black border-white/10", theme.iconColor)}>
                                            {plan.id.toUpperCase()}
                                        </Badge>
                                        {plan.frequency === 'monthly' && (
                                            <Badge className="bg-amber-500 text-black font-bold text-[10px] uppercase gap-1">
                                                <Star className="size-3 fill-current" /> {copy("Best Seller")}
                                            </Badge>
                                        )}
                                    </div>
                                    <h3 className="text-2xl font-black text-white italic tracking-tighter uppercase">
                                        {pickLocalized(locale, plan.name, { en: plan.name_en, es: plan.name_es, de: plan.name_de })}
                                    </h3>
                                </div>
                                <div className={cn("size-12 rounded-xl border-2 flex items-center justify-center bg-black", theme.border, theme.iconColor)}>
                                    <theme.icon className="size-6" />
                                </div>
                            </div>

                            <div className="mt-6 flex flex-col">
                                <div className="flex items-baseline gap-2">
                                    <span className={cn("text-4xl font-black tracking-tighter", theme.iconColor)}>
                                        {plan.trial_price != null ? plan.trial_price : plan.price}€
                                    </span>
                                    {plan.strikethrough_price != null && (
                                        <span className="text-lg font-bold text-neutral-600 line-through">
                                            {plan.strikethrough_price}€
                                        </span>
                                    )}
                                    {plan.trial_price != null && plan.strikethrough_price == null && (
                                        <span className="text-lg font-bold text-neutral-600 line-through">
                                            {plan.price}€
                                        </span>
                                    )}
                                    <span className="text-sm font-bold text-neutral-500 uppercase">
                                        {plan.frequency === 'daily' ? `/${copy('jour')}` :
                                            plan.frequency === 'weekly' ? `/${copy('semaine')}` :
                                                plan.frequency === 'monthly' ? `/${copy('mois')}` :
                                                    plan.frequency === 'quarterly' ? `/${copy('trimestre')}` :
                                                        plan.frequency === 'semi_annual' ? `/${copy('semestre')}` :
                                                            plan.frequency === 'yearly' ? `/${copy('an')}` : `/${copy('forever')}`}
                                    </span>
                                </div>
                                {plan.trial_price != null && plan.trial_days != null && (
                                    <div className="mt-1 flex items-center gap-2">
                                        <Badge variant="outline" className="border-emerald-500/50 text-emerald-500 bg-emerald-500/10 text-[10px] font-bold uppercase">
                                            {copy("OFFRE LANCEMENT")}
                                        </Badge>
                                        <span className="text-[10px] font-mono text-neutral-400">
                                            {plan.trial_price}€ × {plan.trial_days}j {"->"} {copy("puis")} {plan.price}€
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Status */}
                            <div className="mt-4 flex items-center gap-2 text-xs font-mono text-neutral-400">
                                <Shield className="size-3" />
                                {copy("Status")}: {plan.is_active ? <span className="text-emerald-500">{copy("ACTIF")}</span> : <span className="text-red-500">{copy("INACTIF")}</span>}
                            </div>
                        </div>

                        {/* Inventory List (Features) */}
                        <div className="p-8 space-y-4 flex-1">
                            <div className="space-y-3">
                                {displayFeatures.slice(0, 6).map((feature, i) => (
                                    <div key={i} className="flex items-start gap-3 group/item">
                                        <div className={cn(
                                            "mt-0.5 size-4 rounded flex items-center justify-center border shrink-0 transition-colors",
                                            feature.included
                                                ? cn("bg-black group-hover/item:border-white/50", theme.border)
                                                : "bg-white/5 border-white/5"
                                        )}>
                                            {feature.included ? (
                                                <Check className={cn("size-2.5", theme.iconColor)} />
                                            ) : (
                                                <X className="size-2.5 text-neutral-600" />
                                            )}
                                        </div>
                                        <span className={cn(
                                            "text-sm font-medium transition-colors",
                                            feature.included
                                                ? "text-neutral-300 group-hover/item:text-white"
                                                : "text-neutral-600 line-through decoration-white/10"
                                        )}>
                                            {feature.text}
                                        </span>
                                    </div>
                                ))}
                                {displayFeatures.length > 6 && (
                                    <p className="text-xs text-neutral-500 italic pl-7">
                                        + {displayFeatures.length - 6} {copy("autres features...")}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Action Footer */}
                        <div className="p-6 pt-0 mt-auto">
                            <Button
                                onClick={() => onEditPlan(plan)}
                                className={cn("w-full font-bold uppercase tracking-widest bg-white/5 hover:bg-white/10 border border-white/10 text-white")}
                            >
                                <Settings className="size-4 mr-2" /> {copy("Configurer")}
                            </Button>
                        </div>

                    </div>
                );
            })}
        </div>
    );
}
