"use client";

import { useEffect, useState } from "react";
import { PricingCard } from "@/components/pricing/PricingCard";
import type { PricingVariant } from "@/components/pricing/PricingCard";
import { SwipeCarousel } from "@/components/pricing/SwipeCarousel";
import { TrustBadge } from "@/components/pricing/TrustBadge";
import { FeatureMatrix } from "@/components/pricing/FeatureMatrix";
import { FAQSection } from "@/components/pricing/FAQSection";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Zap, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Plan, FeatureDefinition } from "@/types/plans";
import { getDisplayFeatures, getMonthlyEquivalent } from "@/lib/plans";
import { useI18n } from "@/lib/use-i18n";

export default function PricingPage() {
    const { t } = useI18n();
    const [isAnnual, setIsAnnual] = useState(false);
    const [plans, setPlans] = useState<Plan[]>([]);
    const [definitions, setDefinitions] = useState<FeatureDefinition[]>([]);
    const [loading, setLoading] = useState(true);
    const supabase = createClient();

    useEffect(() => {
        const fetchData = async () => {
            try {
                // 1. Fetch Plans
                const { data: plansData, error: plansError } = await supabase
                    .from('plans')
                    .select('*')
                    .eq('is_active', true)
                    .neq('id', 'no_subscription') // Masquer le plan de restriction
                    .order('position', { ascending: true });

                if (plansError) throw plansError;

                // 2. Fetch Feature Definitions
                const { data: defsData, error: defsError } = await supabase
                    .from('feature_definitions')
                    .select('*');

                if (defsError) throw defsError;

                // Sort by ascending price
                const sortedPlans = (plansData || []).sort((a: Plan, b: Plan) => a.price - b.price);
                setPlans(sortedPlans);
                setDefinitions(defsData || []);
            } catch (err) {
                console.error("Error fetching pricing data:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [supabase]);

    if (loading) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <Loader2 className="size-8 text-blue-500 animate-spin" />
            </div>
        );
    }

    const displayPlans = plans.map(dbPlan => {
        // Prepare features flattened list
        const featuresList = getDisplayFeatures(dbPlan, definitions);

        // Visual Logic & Period Mapping
        let period = t("periodMonth");
        let variant: PricingVariant = "monthly";
        let badge: string | undefined = undefined;
        let badgeColor: string | undefined = undefined;
        let priceDisplay = dbPlan.price.toString();
        let cta = t("subscribe");

        switch (dbPlan.frequency) {
            case 'free':
                period = t("periodForever");
                variant = "free";
                cta = t("start");
                break;
            case 'daily':
                period = t("periodDay");
                variant = "monthly";
                break;
            case 'weekly':
                period = t("periodWeek");
                variant = "monthly";
                break;
            case 'monthly':
                period = t("periodMonth");
                variant = "monthly";
                break;
            case 'quarterly':
                period = t("periodQuarter");
                variant = "semi_annual";
                break;
            case 'semi_annual':
                period = t("periodSemester");
                variant = "semi_annual";
                break;
            case 'yearly':
                period = t("periodYear");
                variant = "yearly";

                // If toggle is ON, show monthly equivalent
                if (isAnnual) {
                    priceDisplay = getMonthlyEquivalent(dbPlan.price, 'yearly');
                    period = t("periodMonth"); // Visual trick
                }
                break;
        }

        // Badge from DB (admin-configurable)
        badge = dbPlan.badge_text || undefined;
        badgeColor = dbPlan.badge_color || undefined;

        return {
            id: dbPlan.id,
            name: dbPlan.name,
            price: priceDisplay,
            period,
            desc: dbPlan.description || t("fullAccess"),
            badge,
            badgeColor,
            features: featuresList,
            cta,
            ctaLink: `/signup?plan=${dbPlan.id}`,
            trial_price: dbPlan.trial_price ?? undefined,
            trial_days: dbPlan.trial_days ?? undefined,
            strikethrough_price: dbPlan.strikethrough_price ?? undefined,
            variant,
        };
    });

    return (
        <div className="min-h-screen bg-black relative overflow-hidden">
            {/* Background Atmosphere */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-900/20 via-black to-black pointer-events-none" />
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            <div className="relative container mx-auto px-4 py-24 space-y-24">

                {/* Hero Section */}
                <div className="text-center space-y-6 max-w-3xl mx-auto">
                    <Badge variant="outline" className="border-blue-500/30 text-blue-400 bg-blue-500/10 px-4 py-1 uppercase tracking-widest text-xs font-bold animate-fade-in">
                        <Zap className="size-3 mr-2 fill-blue-500" /> {t("pricingBadge")}
                    </Badge>

                    <h1 className="text-5xl md:text-7xl font-black tracking-tighter text-white animate-fade-in-up">
                        {t("pricingTitlePrefix")} <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">{t("pricingTitleAccent")}</span>
                    </h1>

                    <p className="text-lg text-neutral-400 max-w-xl mx-auto leading-relaxed animate-fade-in-up delay-100">
                        {t("pricingDescription")}
                    </p>

                    {/* Toggle */}
                    <div className="flex items-center justify-center gap-4 animate-fade-in-up delay-200">
                        <Label className={cn("text-sm font-bold cursor-pointer transition-colors", !isAnnual ? "text-white" : "text-neutral-500")}>
                            {t("monthly").toUpperCase()}
                        </Label>
                        <Switch
                            checked={isAnnual}
                            onCheckedChange={setIsAnnual}
                            className="data-[state=checked]:bg-amber-500"
                        />
                        <Label className={cn("text-sm font-bold cursor-pointer transition-colors flex items-center gap-2", isAnnual ? "text-white" : "text-neutral-500")}>
                            {t("annual").toUpperCase()} <Badge className="bg-amber-500 text-black text-[9px] px-1.5 h-4 hover:bg-amber-400">-20%</Badge>
                        </Label>
                    </div>
                </div>

                {/* Pricing Cards */}
                <SwipeCarousel
                    itemCount={displayPlans.length}
                    className="gap-6 lg:gap-10 pb-6 lg:pb-0 pt-4 -mx-4 px-4 lg:mx-0 lg:px-0"
                >
                    {displayPlans.map((plan) => (
                        <div key={plan.id} className="w-[75vw] sm:w-[22rem] shrink-0 snap-center lg:w-full lg:max-w-[26rem] lg:flex-1 lg:flex lg:justify-center transition-all duration-700 ease-out relative">
                            <PricingCard
                                plan={plan}
                                variant={plan.variant}
                            />
                        </div>
                    ))}
                </SwipeCarousel>

                {/* Trust Badge */}
                <div className="py-12">
                    <TrustBadge />
                </div>

                {/* Comparison Matrix */}
                <div className="max-w-5xl mx-auto space-y-8">
                    <div className="text-center space-y-2">
                        <h2 className="text-3xl font-black text-white tracking-tight">{t("dataAdvantage")}</h2>
                        <p className="text-neutral-500">{t("featureComparison")}</p>
                    </div>
                    {/* Matrix would require similar refactor to be dynamic, keeping static for now to focus on cards */}
                    <FeatureMatrix plans={plans} definitions={definitions} />
                </div>

                {/* FAQ */}
                <div className="pb-24">
                    <FAQSection />
                </div>

            </div>
        </div>
    );
}
