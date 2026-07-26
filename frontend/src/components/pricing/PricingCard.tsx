"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Ticket, Crown, Trophy, Gem, ArrowRight, X, Loader2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useI18n } from "@/lib/use-i18n";

/* ══ Centralized color theme per variant ══ */
const VARIANT_THEME = {
    free: {
        glow: "",
        border: "border-white/10",
        bg: "bg-black/40",
        shadow: "",
        iconBg: "bg-white/5 border-white/10 text-neutral-400",
        check: "text-white/20",
        cta: "bg-white/5 hover:bg-white/10 text-white border border-white/10",
        priceColor: "text-white",
    },
    monthly: {
        glow: "bg-gradient-to-b from-blue-500 to-purple-600 opacity-75 blur-2xl group-hover:opacity-100 animate-pulse-slow",
        border: "border-blue-500/50",
        bg: "bg-black/80",
        shadow: "shadow-[inset_0_0_40px_-10px_rgba(59,130,246,0.3)]",
        iconBg: "bg-blue-500/20 border-blue-500/50 text-blue-400",
        check: "text-blue-400",
        cta: "bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_20px_-5px_rgba(37,99,235,0.5)] hover:shadow-[0_0_30px_-5px_rgba(37,99,235,0.7)]",
        priceColor: "text-white",
    },
    semi_annual: {
        glow: "bg-gradient-to-b from-violet-400 to-fuchsia-600 opacity-50 blur-2xl group-hover:opacity-80 animate-pulse-slow",
        border: "border-violet-500/50",
        bg: "bg-black/70",
        shadow: "shadow-[inset_0_0_40px_-10px_rgba(139,92,246,0.25)]",
        iconBg: "bg-violet-500/20 border-violet-500/50 text-violet-400",
        check: "text-violet-400",
        cta: "bg-violet-600 hover:bg-violet-500 text-white shadow-[0_0_20px_-5px_rgba(139,92,246,0.5)] hover:shadow-[0_0_30px_-5px_rgba(139,92,246,0.7)]",
        priceColor: "text-white",
    },
    yearly: {
        glow: "bg-gradient-to-b from-amber-300 to-amber-600 opacity-30 blur-2xl group-hover:opacity-60",
        border: "border-amber-500/30",
        bg: "bg-black/60",
        shadow: "shadow-[inset_0_0_40px_-10px_rgba(245,158,11,0.2)]",
        iconBg: "bg-amber-500/20 border-amber-500/50 text-amber-400",
        check: "text-amber-400",
        cta: "bg-amber-500 hover:bg-amber-400 text-black shadow-[0_0_20px_-5px_rgba(245,158,11,0.5)] hover:shadow-[0_0_30px_-5px_rgba(245,158,11,0.7)]",
        priceColor: "text-white",
    },
} as const;

export type PricingVariant = keyof typeof VARIANT_THEME;

interface PricingFeature {
    text: string;
    included: boolean;
}

interface PricingProps {
    plan: {
        id: string;
        name: string;
        price: string;
        period: string;
        desc: string;
        badge?: string;
        badgeColor?: string;
        features: PricingFeature[];
        cta: string;
        ctaLink: string;
        trial_price?: number | null;
        trial_days?: number | null;
        strikethrough_price?: number | null;
    };
    variant: PricingVariant;
    isCurrentPlan?: boolean;
    subscriptionStatus?: string;
}

export function PricingCard({ plan, variant, isCurrentPlan, subscriptionStatus }: PricingProps) {
    const { t, copy, locale } = useI18n();
    const theme = VARIANT_THEME[variant];
    const isFree = variant === "free";

    const [isCheckingOut, setIsCheckingOut] = useState(false);

    let buttonText = plan.cta;
    let buttonVariantClass = "";

    if (isCurrentPlan) {
        buttonText = t("currentPlan");
        buttonVariantClass = "bg-green-500/20 text-green-400 border-green-500/50 cursor-default hover:bg-green-500/20";
    } else {
        buttonVariantClass = theme.cta;
    }

    const handleCheckout = async () => {
        if (isCurrentPlan) return;

        setIsCheckingOut(true);
        try {
            const res = await fetch('/api/stripe/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ planId: plan.id }),
            });

            const data = await res.json();

            if (!res.ok) {
                console.error('[PricingCard] Checkout error:', data.error);
                toast.error(data.error || t("checkoutCreationError"));
                return;
            }

            // Plan gratuit : redirection directe sans Stripe
            if (data.free && data.redirectUrl) {
                window.location.href = data.redirectUrl;
                return;
            }

            if (data.checkoutUrl) {
                // Redirection vers Stripe Checkout
                window.location.href = data.checkoutUrl;
            }
        } catch (err) {
            console.error('[PricingCard] Network error:', err);
            toast.error(t("networkRetry"));
        } finally {
            setIsCheckingOut(false);
        }
    };

    return (
        <div className={cn(
            "relative group h-full transition-all duration-500 hover:-translate-y-2",
            !isFree ? "z-10" : "z-0",
            isCurrentPlan && "ring-2 ring-green-500/50"
        )}>
            {/* Variant Glow Effect */}
            {!isFree && !isCurrentPlan && theme.glow && (
                <div className={cn("absolute -inset-0.5 transition-opacity duration-500", theme.glow)} />
            )}

            {/* Current Plan Glow */}
            {isCurrentPlan && (
                <div className="absolute -inset-0.5 bg-green-500/30 blur-2xl opacity-50" />
            )}

            <div className={cn(
                "relative h-full flex flex-col p-6 lg:p-8 rounded-3xl overflow-hidden backdrop-blur-3xl border transition-all duration-500",
                isCurrentPlan ? "bg-green-950/30 border-green-500/30" :
                    `${theme.bg} ${theme.border} ${theme.shadow}`
            )}>

                {/* Badges Container */}
                <div className="absolute top-4 right-4 lg:top-6 lg:right-6 flex flex-col gap-2 items-end">
                    {/* Badge */}
                    {plan.badge && (
                        <Badge className={cn(
                            "text-[10px] uppercase font-bold tracking-widest border-0",
                            plan.badgeColor || "bg-white/10 text-white"
                        )}>
                            {plan.badge}
                        </Badge>
                    )}

                    {/* Current Plan Badge */}
                    {isCurrentPlan && (
                        <Badge className="text-[10px] uppercase font-bold tracking-widest border-0 bg-green-500 text-black">
                            {t("active")}
                        </Badge>
                    )}
                </div>

                {/* Header with Fixed Height for Alignment */}
                <div className="mb-4 lg:mb-6 min-h-[120px] lg:min-h-[160px] flex flex-col justify-start">
                    <div className="flex items-center gap-4 mb-3 lg:mb-4">
                        <div className={cn(
                            "size-12 rounded-2xl flex items-center justify-center border shrink-0",
                            isCurrentPlan ? "bg-green-500/20 border-green-500/50 text-green-400" : theme.iconBg
                        )}>
                            {variant === "free" && <Ticket className="size-6" />}
                            {variant === "monthly" && <Crown className="size-6" />}
                            {variant === "semi_annual" && <Gem className="size-6" />}
                            {variant === "yearly" && <Trophy className="size-6" />}
                        </div>
                        <h3 className={cn("text-xl font-bold uppercase tracking-tight", !isFree || isCurrentPlan ? "text-white" : "text-neutral-200")}>
                            {plan.name}
                        </h3>
                    </div>
                    <div className="mt-2 flex-grow flex flex-col justify-end">
                        {plan.trial_price === 0 && plan.trial_days != null ? (
                            /* Scenario 3: Free trial (0 EUR) reference design. */
                            <div className="flex flex-col gap-1">
                                {/* Free trial badge */}
                                <div className="mb-2">
                                    <span className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-green-500/10 text-green-400 text-xs font-bold border border-green-500/20">
                                        {plan.trial_days} {t("freeTrialDays")}
                                    </span>
                                </div>
                                <div className="flex items-baseline flex-wrap gap-x-2 gap-y-1">
                                    {plan.strikethrough_price != null && (
                                        <span className="text-xl lg:text-2xl font-bold text-neutral-500 line-through decoration-neutral-600">
                                            {plan.strikethrough_price}€
                                        </span>
                                    )}
                                    <span className="text-4xl lg:text-[3.25rem] font-black text-green-400 tracking-tight leading-none">
                                        {plan.price}€
                                    </span>
                                    <span className="text-sm font-medium text-neutral-500">{plan.period}</span>
                                </div>
                            </div>
                        ) : plan.trial_price != null && plan.trial_days != null ? (
                            /* Scenario 4: Paid launch offer, for example 14.99 EUR. */
                            <div className="flex flex-col gap-3">
                                <div className="flex items-baseline flex-wrap gap-x-2 gap-y-1">
                                    {plan.strikethrough_price != null && (
                                        <span className="text-xl lg:text-2xl font-bold text-neutral-500 line-through decoration-neutral-600">
                                            {plan.strikethrough_price}€
                                        </span>
                                    )}
                                    <span className="text-4xl lg:text-[3.25rem] font-black text-white tracking-tight leading-none">
                                        {plan.trial_price}€
                                    </span>
                                    <span className="text-[10px] lg:text-[11px] font-bold text-green-400 uppercase tracking-wider bg-green-500/10 px-2 lg:px-2.5 py-1 rounded-md border border-green-500/20 self-center mb-1">
                                        {plan.trial_days} {t("trialDaysSuffix")}
                                    </span>
                                </div>
                                {/* Followed-by pricing inset */}
                                <div className="text-xs font-semibold text-neutral-400 bg-white/[0.03] backdrop-blur-sm py-2 px-3 rounded-lg border border-white/10 inline-flex w-fit items-center gap-1.5 align-middle">
                                    <span className="text-neutral-500">{copy("puis")}</span>
                                    <span className="text-white font-bold">{plan.price}€</span>
                                    <span className="text-neutral-500">{plan.period}</span>
                                </div>
                            </div>
                        ) : (
                            /* Scenarios 1 and 2: normal price, with or without a strikethrough price. */
                            <div className="flex flex-col gap-2">
                                <div className="flex items-baseline flex-wrap gap-x-2 gap-y-1">
                                    {plan.strikethrough_price != null && (
                                        <span className="text-xl lg:text-2xl font-bold text-neutral-500 line-through decoration-neutral-600">
                                            {plan.strikethrough_price}€
                                        </span>
                                    )}
                                    <span className="text-4xl lg:text-[3.25rem] font-black text-white tracking-tight leading-none">
                                        {plan.price}€
                                    </span>
                                    <span className="text-xs lg:text-sm font-medium text-neutral-500">{plan.period}</span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Description - Fixed positioning below the header */}
                <p className="text-xs lg:text-sm text-neutral-400 mb-4 lg:mb-6 font-medium border-t border-white/5 pt-3 lg:pt-4">{plan.desc}</p>

                {/* Features (No flex-1, letting them sit naturally under the description) */}
                <ul className="space-y-3 lg:space-y-4 mb-6 lg:mb-8">
                    {plan.features.map((f, i) => (
                        <li key={i} className={cn("flex items-start gap-3 text-sm", f.included ? "text-neutral-300" : "text-neutral-600/50")}>
                            {f.included ? (
                                <CheckCircle2 className={cn("size-5 shrink-0",
                                    isCurrentPlan ? "text-green-400" : theme.check
                                )} />
                            ) : (
                                <X className="size-5 shrink-0" />
                            )}
                            <span className={cn(f.included ? "" : "line-through")}>{f.text}</span>
                        </li>
                    ))}
                </ul>

                {/* CTA Button Wrapper - Pushed to bottom with mt-auto */}
                <div className="mt-auto pt-6">
                    {isCurrentPlan ? (
                        <Button disabled={true} className={cn("w-full h-12 font-bold uppercase tracking-wide transition-all duration-300", buttonVariantClass)}>
                            {buttonText} {subscriptionStatus && subscriptionStatus !== 'active' && `(${subscriptionStatus})`}
                        </Button>
                    ) : isFree ? (
                        <Link href={`/${locale}/signup`} className="block">
                            <Button className={cn("w-full h-12 font-bold uppercase tracking-wide transition-all duration-300 group/btn", buttonVariantClass)}>
                                {buttonText} <ArrowRight className="size-4 ml-2 group-hover/btn:translate-x-1 transition-transform" />
                            </Button>
                        </Link>
                    ) : (
                        <Button
                            onClick={handleCheckout}
                            disabled={isCheckingOut}
                            className={cn("w-full h-12 font-bold uppercase tracking-wide transition-all duration-300 group/btn", buttonVariantClass)}
                        >
                            {isCheckingOut ? (
                                <><Loader2 className="size-4 mr-2 animate-spin" /> {t("secureRedirect")}</>
                            ) : (
                                <>{buttonText} <ArrowRight className="size-4 ml-2 group-hover/btn:translate-x-1 transition-transform" /></>
                            )}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
}
