"use client";

import { useEffect, useState } from "react";
import { PricingCard } from "@/components/pricing/PricingCard";
import type { PricingVariant } from "@/components/pricing/PricingCard";
import { SwipeCarousel } from "@/components/pricing/SwipeCarousel";
import { createClient } from "@/lib/supabase/client";
import { Plan, FeatureDefinition } from "@/types/plans";
import { getDisplayFeatures } from "@/lib/plans";
import { pickLocalized } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { Loader2, Sparkles, Shield, Zap, TrendingUp } from "lucide-react";
import { useI18n } from "@/lib/use-i18n";

export function SubscriptionWall() {
    const { t, locale } = useI18n();
    const [plans, setPlans] = useState<Plan[]>([]);
    const [definitions, setDefinitions] = useState<FeatureDefinition[]>([]);
    const [loading, setLoading] = useState(true);
    const supabase = createClient();
    const valueProps = [
        { icon: Zap, label: t("valueAi"), color: "text-blue-400" },
        { icon: TrendingUp, label: t("valueSports"), color: "text-emerald-400" },
        { icon: Shield, label: t("valueData"), color: "text-purple-400" },
    ];

    useEffect(() => {
        const fetchPlans = async () => {
            try {
                const [plansRes, defsRes] = await Promise.all([
                    supabase
                        .from("plans")
                        .select("*")
                        .eq("is_active", true)
                        .neq("id", "no_subscription")
                        .order("position", { ascending: true }),
                    supabase.from("feature_definitions").select("*"),
                ]);

                if (plansRes.data) {
                    const sorted = [...plansRes.data].sort((a: Plan, b: Plan) => a.price - b.price);
                    setPlans(sorted);
                }
                if (defsRes.data) setDefinitions(defsRes.data);
            } catch (err) {
                console.error("[SubscriptionWall] Error fetching plans:", err);
            } finally {
                setLoading(false);
            }
        };
        fetchPlans();
    }, [supabase]);

    return (
        <div className="relative flex flex-col items-center justify-center min-h-[calc(100vh-3.5rem)] w-full overflow-hidden px-4 py-12">
            {/* Animated background */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-blue-600/8 rounded-full blur-[120px] animate-pulse" />
                <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-purple-600/8 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: "1s" }} />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-emerald-600/5 rounded-full blur-[80px] animate-pulse" style={{ animationDelay: "2s" }} />
            </div>

            {/* Content */}
            <div className="relative z-10 flex flex-col items-center w-full max-w-7xl">

                {/* Hero Section */}
                <div className="text-center mb-10 sm:mb-14 space-y-5 max-w-2xl animate-in fade-in slide-in-from-bottom-6 duration-700">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold uppercase tracking-widest">
                        <Sparkles className="size-3.5" />
                        {t("premiumRequired")}
                    </div>

                    <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.1]">
                        {t("unlockBetix")}
                        <span className="block bg-gradient-to-r from-blue-400 via-purple-400 to-emerald-400 bg-clip-text text-transparent">
                            {t("betixPotential")}
                        </span>
                    </h1>

                    <p className="text-base sm:text-lg text-neutral-400 max-w-xl mx-auto leading-relaxed">
                        {t("premiumWallCopy")}
                    </p>
                </div>

                {/* Value Props */}
                <div className="flex flex-wrap justify-center gap-4 sm:gap-8 mb-10 sm:mb-14 animate-in fade-in slide-in-from-bottom-8 duration-700" style={{ animationDelay: "200ms" }}>
                    {valueProps.map((prop, i) => (
                        <div key={i} className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-white/[0.03] border border-white/5">
                            <prop.icon className={cn("size-4 shrink-0", prop.color)} />
                            <span className="text-sm font-medium text-neutral-300">{prop.label}</span>
                        </div>
                    ))}
                </div>

                {/* Plans */}
                <div className="w-full animate-in fade-in slide-in-from-bottom-10 duration-700" style={{ animationDelay: "400ms" }}>
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="size-8 text-blue-500 animate-spin" />
                        </div>
                    ) : plans.length === 0 ? (
                        <div className="text-center py-12 text-neutral-500">
                            <p>{t("noPlansAvailable")}</p>
                        </div>
                    ) : (
                        <SwipeCarousel
                            itemCount={plans.length}
                            className="gap-4 lg:gap-8 pb-8 lg:pb-0 pt-4 px-6 sm:px-12 lg:px-0 -mx-4 lg:mx-0 snap-x snap-mandatory"
                        >
                            {plans.map((dbPlan) => {
                                const featuresList = getDisplayFeatures(dbPlan, definitions, locale);

                                let period = t("periodMonth");
                                let variant: PricingVariant = "monthly";
                                let cta = t("subscribe");

                                const badge = dbPlan.badge_text
                                    ? pickLocalized(locale, dbPlan.badge_text, { en: dbPlan.badge_text_en, es: dbPlan.badge_text_es, de: dbPlan.badge_text_de })
                                    : undefined;
                                const badgeColor = dbPlan.badge_color || undefined;

                                switch (dbPlan.frequency) {
                                    case "free": period = t("periodForever"); variant = "free"; cta = t("startFree"); break;
                                    case "daily": period = t("periodDay"); break;
                                    case "weekly": period = t("periodWeek"); break;
                                    case "monthly": period = t("periodMonth"); break;
                                    case "quarterly": period = t("periodQuarter"); variant = "semi_annual"; break;
                                    case "semi_annual": period = t("periodSemester"); variant = "semi_annual"; break;
                                    case "yearly": period = t("periodYear"); variant = "yearly"; break;
                                }

                                const planProps = {
                                    id: dbPlan.id,
                                    name: pickLocalized(locale, dbPlan.name, { en: dbPlan.name_en, es: dbPlan.name_es, de: dbPlan.name_de }),
                                    price: dbPlan.price.toString(),
                                    period,
                                    desc: dbPlan.description
                                        ? pickLocalized(locale, dbPlan.description, { en: dbPlan.description_en, es: dbPlan.description_es, de: dbPlan.description_de })
                                        : t("fullAccess"),
                                    badge,
                                    badgeColor,
                                    features: featuresList,
                                    cta,
                                    ctaLink: `/api/stripe/checkout?planId=${dbPlan.stripe_price_id || dbPlan.id}`,
                                    promo: dbPlan.promo ? {
                                        price: dbPlan.promo.price,
                                        duration: dbPlan.promo.duration,
                                        savings: dbPlan.promo.savings,
                                    } : undefined,
                                    trial_price: dbPlan.trial_price ?? undefined,
                                    trial_days: dbPlan.trial_days ?? undefined,
                                    strikethrough_price: dbPlan.strikethrough_price ?? undefined,
                                };

                                const count = plans.length;
                                const maxWidthClass =
                                    count === 1 ? "lg:max-w-[38rem] lg:scale-105" :
                                        count === 2 ? "lg:max-w-[30rem]" :
                                            count === 3 ? "lg:max-w-[24rem]" :
                                                "lg:max-w-[20rem]";

                                return (
                                    <div key={dbPlan.id} className={cn(
                                        "w-[85vw] max-w-[320px] sm:w-[22rem] shrink-0 snap-center lg:w-full lg:flex lg:justify-center transition-all duration-700 ease-out relative",
                                        maxWidthClass
                                    )}>
                                        <PricingCard
                                            plan={planProps}
                                            variant={variant}
                                            isCurrentPlan={false}
                                        />
                                    </div>
                                );
                            })}
                        </SwipeCarousel>
                    )}
                </div>

                {/* Footer trust */}
                <div className="mt-10 text-center animate-in fade-in duration-1000" style={{ animationDelay: "600ms" }}>
                    <p className="text-xs text-neutral-600">
                        {t("securePaymentCancelAnytime")}
                    </p>
                </div>
            </div>
        </div>
    );
}
