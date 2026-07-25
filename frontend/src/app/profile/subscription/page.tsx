"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { PricingCard } from "@/components/pricing/PricingCard";
import type { PricingVariant } from "@/components/pricing/PricingCard";
import { SwipeCarousel } from "@/components/pricing/SwipeCarousel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { CreditCard, ShieldCheck, Loader2, Clock, AlertTriangle, Ban } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Plan, FeatureDefinition } from "@/types/plans";
import { getDisplayFeatures } from "@/lib/plans";
import { estimateAnnualRefund, formatCurrency, getCancellationKind } from "@/lib/billing";
import { getLocaleFromPath, t, pickLocalized } from "@/lib/i18n";

export default function SubscriptionPage() {
    const { subscription, currentPlanId, isLoading: authLoading } = useAuth();
    const [plans, setPlans] = useState<Plan[]>([]);
    const [definitions, setDefinitions] = useState<FeatureDefinition[]>([]);
    const [loadingPlans, setLoadingPlans] = useState(true);
    const [verifying, setVerifying] = useState(false);
    const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
    const [cancelReason, setCancelReason] = useState("");
    const [isCancelling, setIsCancelling] = useState(false);
    const router = useRouter();
    const pathname = usePathname();
    const locale = getLocaleFromPath(pathname) || "fr";
    const supabase = createClient();

    // Auto-verification after Stripe redirect.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const status = params.get('status');
        const planId = params.get('planId');
        const sessionId = params.get('session_id');

        if (status === 'success' && planId && !verifying) {
            setVerifying(true);
            const verify = async () => {
                try {
                    toast.info(t(locale, "verifyingPayment"));
                    const res = await fetch('/api/stripe/verify', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ planId, sessionId }),
                    });
                    const data = await res.json();
                    if (res.ok && data.verified) {
                        toast.success(t(locale, "subscriptionActivated"));
                        setTimeout(() => {
                            window.location.href = `/${locale}/profile/subscription`;
                        }, 2000);
                    } else {
                        toast.warning(data.message || data.error || t(locale, "paymentNotConfirmed"));
                        router.replace(`/${locale}/profile/subscription`);
                    }
                } catch (err) {
                    console.error('[Subscription] Verify error:', err);
                    toast.error(t(locale, "paymentVerificationError"));
                    router.replace(`/${locale}/profile/subscription`);
                }
            };
            verify();
        }
    }, [locale, router, verifying]);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const { data: plansData, error: plansError } = await supabase
                    .from("plans")
                    .select("*")
                    .eq('is_active', true)
                    .neq('id', 'no_subscription')
                    .order("position", { ascending: true });

                if (plansError) throw plansError;

                // 2. Fetch Feature Definitions
                const { data: defsData, error: defsError } = await supabase
                    .from('feature_definitions')
                    .select('*');

                if (defsError) throw defsError;

                // Sort plans by ascending price
                const sortedPlans = (plansData || []).sort((a: Plan, b: Plan) => a.price - b.price);

                setPlans(sortedPlans);
                setDefinitions(defsData || []);
            } catch (err) {
                console.error("Error fetching subscription data:", err);
            } finally {
                setLoadingPlans(false);
            }
        };

        console.log("SubscriptionPage: Fetching plans...");
        fetchData();
    }, [supabase]);

    const formatDate = (dateString?: string | null) => {
        if (!dateString) return "N/A";
        const dateLocale = { fr: "fr-FR", en: "en-US", es: "es-ES", de: "de-DE" }[locale];
        return new Date(dateString).toLocaleDateString(dateLocale, {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const monthlyPlan = plans.find((plan) => plan.frequency === "monthly");
    const cancellationKind = getCancellationKind(subscription?.status, subscription?.plan?.frequency);
    const estimatedRefund = estimateAnnualRefund({
        planPrice: Number(subscription?.plan?.price || 0),
        planFrequency: subscription?.plan?.frequency,
        monthlyPrice: Number(monthlyPlan?.price || 0),
        subscriptionCreatedAt: subscription?.created_at,
        currentPeriodEnd: subscription?.current_period_end,
    });
    const isScheduledToCancel = Boolean(subscription?.cancel_at_period_end);

    const handleCancelSubscription = async () => {
        setIsCancelling(true);
        try {
            const res = await fetch('/api/stripe/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: cancelReason.trim() || undefined }),
            });
            const data = await res.json();

            if (!res.ok) {
                toast.error(data.error || t(locale, "cancellationFailed"));
                return;
            }

            toast.success(data.message || t(locale, "cancellationSuccess"));
            setCancelDialogOpen(false);
            setCancelReason("");
            await refreshCurrentPage();
        } catch (error) {
            console.error('[Subscription] Cancel error:', error);
            toast.error(t(locale, "networkRetry"));
        } finally {
            setIsCancelling(false);
        }
    };

    const refreshCurrentPage = async () => {
        router.refresh();
        window.setTimeout(() => window.location.reload(), 500);
    };

    if (authLoading || loadingPlans) {
        return (
            <div className="flex items-center justify-center p-12 lg:p-24">
                <Loader2 className="w-8 h-8 lg:w-10 lg:h-10 text-blue-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-12 lg:space-y-24 animate-fade-in pb-12 lg:pb-24">

            {/* Current subscription management section */}
            <section className="space-y-4 lg:space-y-6 max-w-7xl mx-auto">
                <div className="flex flex-col gap-2">
                    <h2 className="text-xl lg:text-3xl font-black text-white flex items-center gap-2 lg:gap-3">
                        <CreditCard className="w-5 h-5 lg:w-7 lg:h-7 text-blue-500" />
                        {t(locale, "subscriptionTitle")}
                    </h2>
                    <p className="text-sm lg:text-base text-neutral-400">
                        {t(locale, "subscriptionSubtitle")}
                    </p>
                </div>

                <div className="bg-black/40 border border-white/10 backdrop-blur-xl p-6 md:p-8 rounded-3xl relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                    <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                        {/* Plan Info */}
                        <div className="space-y-3 w-full md:w-auto">
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                                    {t(locale, "currentPlan")}
                                </span>
                                {subscription?.status === "active" && (
                                    <Badge className="bg-green-500/10 text-green-400 hover:bg-green-500/20 border-green-500/20">
                                        {t(locale, "active")}
                                    </Badge>
                                )}
                                {subscription?.status === "trialing" && (
                                    <Badge className="bg-blue-500 text-white font-bold text-[10px] uppercase">
                                        {t(locale, "trial")}
                                    </Badge>
                                )}
                                {subscription?.status === "canceled" && (
                                    <Badge variant="outline" className="text-neutral-400">{t(locale, "inactive")}</Badge>
                                )}
                                {isScheduledToCancel && (
                                    <Badge className="bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/20">
                                        {t(locale, "scheduledCancellation")}
                                    </Badge>
                                )}
                            </div>
                            <h3 className="text-3xl lg:text-5xl font-black text-white tracking-tight">
                                {subscription?.plan?.name || t(locale, "noPlan")}
                            </h3>
                            {subscription?.current_period_end && (
                                <p className="text-sm text-neutral-400 flex items-center gap-2">
                                    <Clock className="w-4 h-4" />
                                    {subscription.status === 'trialing'
                                        ? t(locale, "trialEndsOn")
                                        : isScheduledToCancel
                                            ? t(locale, "accessUntil")
                                            : t(locale, "renewsOn")}{" "}
                                    <span className="font-bold text-white">
                                        {formatDate(subscription.current_period_end)}
                                    </span>
                                </p>
                            )}
                            {subscription?.estimated_refund_amount != null && (
                                <p className="text-sm text-amber-300 flex items-center gap-2">
                                    <AlertTriangle className="w-4 h-4" />
                                    {t(locale, "estimatedAnnualRefund")} : {formatCurrency(Number(subscription.estimated_refund_amount))}
                                </p>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col items-center md:items-end gap-2 w-full md:w-auto shrink-0 mt-4 md:mt-0">
                            {subscription && subscription.status !== "canceled" && !isScheduledToCancel && subscription.plan?.id !== 'no_subscription' && (
                                <Button
                                    variant="ghost"
                                    onClick={() => setCancelDialogOpen(true)}
                                    className="text-red-300 hover:text-red-200 hover:bg-red-500/10 text-xs h-9 px-4 gap-2 transition-all"
                                >
                                    <Ban className="w-3.5 h-3.5" />
                                    {t(locale, "cancelSubscription")}
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
                <DialogContent className="bg-neutral-950 border-white/10 text-white">
                    <DialogHeader>
                        <DialogTitle>{t(locale, "cancelDialogTitle")}</DialogTitle>
                        <DialogDescription>
                            {t(locale, "cancelDialogDescription")}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 text-sm text-neutral-300">
                        {cancellationKind === "trial" && (
                            <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4">
                                {t(locale, "trialCancelWarning")}
                            </div>
                        )}

                        {cancellationKind === "paid" && (
                            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
                                {t(locale, "paidCancelWarning")}{" "}
                                <strong className="text-white">{formatDate(subscription?.current_period_end)}</strong>.
                            </div>
                        )}

                        {cancellationKind === "annual" && (
                            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 space-y-2">
                                <p>
                                    {t(locale, "annualCancelWarning")}{" "}
                                    <strong className="text-white">{formatDate(subscription?.current_period_end)}</strong>.
                                </p>
                                <p>
                                    {t(locale, "annualRefundEstimate")} :{" "}
                                    <strong className="text-white">{formatCurrency(estimatedRefund ?? 0)}</strong>.
                                    {" "}{t(locale, "finalRefundReviewed")}
                                </p>
                            </div>
                        )}

                        <Textarea
                            value={cancelReason}
                            onChange={(event) => setCancelReason(event.target.value)}
                            placeholder={t(locale, "cancelReasonPlaceholder")}
                            className="min-h-24 bg-black/40 border-white/10"
                        />
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setCancelDialogOpen(false)}
                            disabled={isCancelling}
                            className="border-white/10 bg-white/5"
                        >
                            {t(locale, "keepSubscription")}
                        </Button>
                        <Button
                            onClick={handleCancelSubscription}
                            disabled={isCancelling}
                            className="bg-red-600 hover:bg-red-500 text-white"
                        >
                            {isCancelling ? (
                                <><Loader2 className="size-4 mr-2 animate-spin" /> {t(locale, "confirmingCancellation")}</>
                            ) : (
                                t(locale, "confirmCancellation")
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Plans Grid */}
            <div className="space-y-6 max-w-7xl mx-auto w-full">
                <h3 className="text-xl font-bold text-white uppercase tracking-widest flex items-center gap-2">
                    <ShieldCheck className="size-5 text-blue-500" />
                    {t(locale, "changePlan")}
                </h3>

                {plans.length === 0 ? (
                    <div className="bg-amber-500/10 border border-amber-500/20 p-8 rounded-3xl text-center">
                        <p className="text-amber-500">
                            {t(locale, "noPlansFound")}
                        </p>
                    </div>
                ) : (
                    <SwipeCarousel
                        itemCount={plans.length}
                        className="gap-4 lg:gap-8 pb-8 lg:pb-0 pt-4 px-6 sm:px-12 lg:px-0 -mx-4 lg:mx-0 snap-x snap-mandatory"
                    >
                        {plans.map((dbPlan) => {
                            const isCurrent = currentPlanId === dbPlan.id;

                            const featuresList = getDisplayFeatures(dbPlan, definitions, locale);

                            let period = t(locale, "periodMonth");
                            let variant: PricingVariant = "monthly";
                            const priceDisplay = dbPlan.price.toString();
                            let cta = t(locale, "subscribe");

                            const badge = dbPlan.badge_text || undefined;
                            const badgeColor = dbPlan.badge_color || undefined;

                            switch (dbPlan.frequency) {
                                case 'free':
                                    period = t(locale, "periodForever");
                                    variant = "free";
                                    cta = t(locale, "stayFree");
                                    break;
                                case 'daily':
                                    period = t(locale, "periodDay");
                                    variant = "monthly";
                                    break;
                                case 'weekly':
                                    period = t(locale, "periodWeek");
                                    variant = "monthly";
                                    break;
                                case 'monthly':
                                    period = t(locale, "periodMonth");
                                    variant = "monthly";
                                    break;
                                case 'quarterly':
                                    period = t(locale, "periodQuarter");
                                    variant = "semi_annual";
                                    break;
                                case 'semi_annual':
                                    period = t(locale, "periodSemester");
                                    variant = "semi_annual";
                                    break;
                                case 'yearly':
                                    period = t(locale, "periodYear");
                                    variant = "yearly";
                                    break;
                            }

                            const planProps = {
                                id: dbPlan.id,
                                name: pickLocalized(locale, dbPlan.name, { en: dbPlan.name_en, es: dbPlan.name_es, de: dbPlan.name_de }),
                                price: priceDisplay,
                                period,
                                desc: dbPlan.description
                                    ? pickLocalized(locale, dbPlan.description, { en: dbPlan.description_en, es: dbPlan.description_es, de: dbPlan.description_de })
                                    : t(locale, "fullAccess"),
                                badge,
                                badgeColor,
                                features: featuresList,
                                cta,
                                ctaLink: `/api/stripe/checkout?planId=${dbPlan.stripe_price_id || dbPlan.id}`,
                                promo: dbPlan.promo ? {
                                    price: dbPlan.promo.price,
                                    duration: dbPlan.promo.duration,
                                    savings: dbPlan.promo.savings
                                } : undefined,
                                trial_price: dbPlan.trial_price ?? undefined,
                                trial_days: dbPlan.trial_days ?? undefined,
                                strikethrough_price: dbPlan.strikethrough_price ?? undefined
                            };

                            return (
                                <div key={dbPlan.id} className="w-[85vw] max-w-[320px] sm:w-[22rem] shrink-0 snap-center lg:w-full lg:max-w-[24rem] lg:flex-1 lg:flex lg:justify-center transition-all duration-700 ease-out relative">
                                    <PricingCard
                                        plan={planProps}
                                        variant={variant}
                                        isCurrentPlan={isCurrent}
                                        subscriptionStatus={subscription?.status}
                                    />
                                </div>
                            );
                        })}
                    </SwipeCarousel>
                )}
            </div>
        </div>
    );
}
