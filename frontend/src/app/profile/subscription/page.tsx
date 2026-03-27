"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { PricingCard } from "@/components/pricing/PricingCard";
import type { PricingVariant } from "@/components/pricing/PricingCard";
import { SwipeCarousel } from "@/components/pricing/SwipeCarousel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CreditCard, History, ShieldCheck, Zap, Loader2, Clock, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { Plan, FeatureDefinition } from "@/types/plans";
import { getDisplayFeatures } from "@/lib/plans";
import { cn } from "@/lib/utils";

export default function SubscriptionPage() {
    const { user, profile, subscription, currentPlanId, isLoading: authLoading } = useAuth();
    const [plans, setPlans] = useState<Plan[]>([]);
    const [definitions, setDefinitions] = useState<FeatureDefinition[]>([]);
    const [loadingPlans, setLoadingPlans] = useState(true);
    const [verifying, setVerifying] = useState(false);
    const router = useRouter();
    const supabase = createClient();
    const [showCancelOption, setShowCancelOption] = useState(false);

    // Auto-vérification après redirection Stripe
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const status = params.get('status');
        const planId = params.get('planId');
        const sessionId = params.get('session_id');

        if (status === 'success' && planId && !verifying) {
            setVerifying(true);
            const verify = async () => {
                try {
                    toast.info('Vérification du paiement en cours...');
                    const res = await fetch('/api/stripe/verify', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ planId, sessionId }),
                    });
                    const data = await res.json();
                    if (res.ok && data.verified) {
                        toast.success('Abonnement activé avec succès ! 🎉');
                        setTimeout(() => {
                            window.location.href = '/profile/subscription';
                        }, 2000);
                    } else {
                        toast.warning(data.message || data.error || 'Le paiement n\'a pas encore été confirmé.');
                        router.replace('/profile/subscription');
                    }
                } catch (err) {
                    console.error('[Subscription] Verify error:', err);
                    toast.error('Erreur lors de la vérification du paiement.');
                    router.replace('/profile/subscription');
                }
            };
            verify();
        }
    }, []);

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

    const handleCancelMail = async () => {
        try {
            const { data: subRow } = await supabase
                .from('subscriptions')
                .select('stripe_subscription_id')
                .eq('user_id', user?.id ?? '')
                .in('status', ['active', 'trialing', 'past_due'])
                .maybeSingle();

            const { data: profileRow } = await supabase
                .from('profiles')
                .select('stripe_customer_id')
                .eq('id', user?.id ?? '')
                .maybeSingle();

            const userName = profile?.username || 'N/A';
            const userEmail = user?.email || 'N/A';
            const planName = subscription?.plan?.name || 'N/A';
            const subStatus = subscription?.status || 'N/A';
            const periodEnd = subscription?.current_period_end
                ? formatDate(subscription.current_period_end)
                : 'N/A';
            const stripeSubId = subRow?.stripe_subscription_id || 'N/A';
            const stripeCustId = profileRow?.stripe_customer_id || 'N/A';

            const subject = encodeURIComponent('Résiliation');
            const body = encodeURIComponent(
                `Bonjour,\n\nJe souhaite résilier mon abonnement.\n\n` +
                `--- Informations client ---\n` +
                `Nom : ${userName}\n` +
                `Email : ${userEmail}\n` +
                `Plan : ${planName}\n` +
                `Statut : ${subStatus}\n` +
                `Fin de période : ${periodEnd}\n` +
                `ID Abonnement Stripe : ${stripeSubId}\n` +
                `ID Client Stripe : ${stripeCustId}\n` +
                `ID Utilisateur : ${user?.id || 'N/A'}\n\n` +
                `Cordialement.`
            );

            window.location.href = `mailto:bet-ix@outlook.fr?subject=${subject}&body=${body}`;
        } catch (error) {
            console.error('[Subscription] Cancel mail error:', error);
            toast.error('Impossible de préparer le mail. Veuillez réessayer.');
        }
    };

    if (authLoading || loadingPlans) {
        return (
            <div className="flex items-center justify-center p-12 lg:p-24">
                <Loader2 className="w-8 h-8 lg:w-10 lg:h-10 text-blue-500 animate-spin" />
            </div>
        );
    }

    const formatDate = (dateString?: string) => {
        if (!dateString) return "N/A";
        return new Date(dateString).toLocaleDateString('fr-FR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    return (
        <div className="space-y-12 lg:space-y-24 animate-fade-in pb-12 lg:pb-24">

            {/* Section Gestion Abonnement Actuel */}
            <section className="space-y-4 lg:space-y-6 max-w-7xl mx-auto">
                <div className="flex flex-col gap-2">
                    <h2 className="text-xl lg:text-3xl font-black text-white flex items-center gap-2 lg:gap-3">
                        <CreditCard className="w-5 h-5 lg:w-7 lg:h-7 text-blue-500" />
                        Gestion de l&apos;Abonnement
                    </h2>
                    <p className="text-sm lg:text-base text-neutral-400">
                        Gérez votre plan, vos factures et vos méthodes de paiement.
                    </p>
                </div>

                <div className="bg-black/40 border border-white/10 backdrop-blur-xl p-6 md:p-8 rounded-3xl relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                    <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                        {/* Plan Info */}
                        <div className="space-y-3 w-full md:w-auto">
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                                    Plan Actuel
                                </span>
                                {subscription?.status === "active" && (
                                    <Badge className="bg-green-500/10 text-green-400 hover:bg-green-500/20 border-green-500/20">
                                        Active
                                    </Badge>
                                )}
                                {subscription?.status === "trialing" && (
                                    <Badge className="bg-blue-500 text-white font-bold text-[10px] uppercase">
                                        Essai
                                    </Badge>
                                )}
                                {subscription?.status === "canceled" && (
                                    <Badge variant="outline" className="text-neutral-400">Inactif</Badge>
                                )}
                            </div>
                            <h3 className="text-3xl lg:text-5xl font-black text-white tracking-tight">
                                {subscription?.plan?.name || "Aucun abonnement"}
                            </h3>
                            {subscription?.current_period_end && (
                                <p className="text-sm text-neutral-400 flex items-center gap-2">
                                    <Clock className="w-4 h-4" />
                                    {subscription.status === 'trialing' ? 'Fin de l\'essai le' : 'Renouvellement le'}{" "}
                                    <span className="font-bold text-white">
                                        {formatDate(subscription.current_period_end)}
                                    </span>
                                </p>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col items-center md:items-end gap-2 w-full md:w-auto shrink-0 mt-4 md:mt-0">
                            {subscription && subscription.status !== "canceled" && (
                                <div className="flex flex-col items-center md:items-end gap-1 w-full md:w-auto">
                                    {!showCancelOption ? (
                                        <button
                                            onClick={() => setShowCancelOption(true)}
                                            className="text-xs text-neutral-500 hover:text-neutral-400 underline underline-offset-2 transition-colors"
                                        >
                                            Vous souhaitez résilier ?
                                        </button>
                                    ) : (
                                        <Button
                                            variant="ghost"
                                            onClick={handleCancelMail}
                                            className="text-red-400/70 hover:text-red-400 hover:bg-red-500/10 text-xs h-9 px-4 gap-2 transition-all"
                                        >
                                            <Mail className="w-3.5 h-3.5" />
                                            Envoyer une demande par mail
                                        </Button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* Plans Grid */}
            <div className="space-y-6 max-w-7xl mx-auto w-full">
                <h3 className="text-xl font-bold text-white uppercase tracking-widest flex items-center gap-2">
                    <ShieldCheck className="size-5 text-blue-500" />
                    Changer de Plan
                </h3>

                {plans.length === 0 ? (
                    <div className="bg-amber-500/10 border border-amber-500/20 p-8 rounded-3xl text-center">
                        <p className="text-amber-500">
                            Aucun plan trouvé. Veuillez vérifier la connexion ou le seed de la base de données.
                        </p>
                    </div>
                ) : (
                    <SwipeCarousel
                        itemCount={plans.length}
                        className="gap-4 lg:gap-8 pb-8 lg:pb-0 pt-4 px-6 sm:px-12 lg:px-0 -mx-4 lg:mx-0 snap-x snap-mandatory"
                    >
                        {plans.map((dbPlan) => {
                            const isCurrent = currentPlanId === dbPlan.id;

                            const featuresList = getDisplayFeatures(dbPlan, definitions);

                            let period = "/mois";
                            let variant: PricingVariant = "monthly";
                            let priceDisplay = dbPlan.price.toString();
                            let cta = "S'abonner";

                            const badge = dbPlan.badge_text || undefined;
                            const badgeColor = dbPlan.badge_color || undefined;

                            switch (dbPlan.frequency) {
                                case 'free':
                                    period = "/forever";
                                    variant = "free";
                                    cta = "Rester Gratuit";
                                    break;
                                case 'daily':
                                    period = "/jour";
                                    variant = "monthly";
                                    break;
                                case 'weekly':
                                    period = "/semaine";
                                    variant = "monthly";
                                    break;
                                case 'monthly':
                                    period = "/mois";
                                    variant = "monthly";
                                    break;
                                case 'quarterly':
                                    period = "/trimestre";
                                    variant = "semi_annual";
                                    break;
                                case 'semi_annual':
                                    period = "/semestre";
                                    variant = "semi_annual";
                                    break;
                                case 'yearly':
                                    period = "/an";
                                    variant = "yearly";
                                    break;
                            }

                            const planProps = {
                                id: dbPlan.id,
                                name: dbPlan.name,
                                price: priceDisplay,
                                period,
                                desc: dbPlan.description || "Accès complet",
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
