import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, CreditCard, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth, UserSubscription } from "@/components/auth/AuthProvider";
import { useI18n } from "@/lib/use-i18n";

interface SeasonPassProps {
    // Prop is optional now as we use context, but kept for compatibility if passed
    subscription?: UserSubscription | any;
}

export function SeasonPass({ subscription: propSub }: SeasonPassProps) {
    const { copy, locale } = useI18n();
    const { subscription: authSub, currentPlanId, isLoading } = useAuth();
    const router = useRouter();

    // Prioritize auth data, fallback to prop (for flexibility)
    const subscription = authSub || propSub;

    // If loading or no subscription data found (and not mock), default to free visual
    if (isLoading && !propSub) {
        return (
            <div className="h-48 rounded-3xl border border-white/10 bg-black/40 backdrop-blur-xl flex items-center justify-center">
                <Loader2 className="animate-spin text-blue-500" />
            </div>
        );
    }

    const isPremium = currentPlanId !== "free";
    const planName = subscription?.plan?.name || "The Scout";

    // Normalize benefits to always be an array
    const rawFeatures = subscription?.plan?.features;
    let benefits: (string | { text: string; included?: boolean })[] = [];
    // ^ Initialize as empty array explicitly

    if (Array.isArray(rawFeatures)) {
        benefits = rawFeatures;
    } else if (rawFeatures && typeof rawFeatures === 'object') {
        // If it's a PlanFeatures object (core, advanced, vip), extract the values
        const pf = rawFeatures as any;
        const extracted: string[] = [];

        ['core', 'advanced', 'vip'].forEach(key => {
            if (pf[key] && typeof pf[key] === 'object') {
                Object.entries(pf[key]).forEach(([label, val]: [string, any]) => {
                    const text = typeof val === 'object' && val.display ? val.display : label;
                    extracted.push(text);
                });
            }
        });
        benefits = extracted;
    }

    // Default fallback if empty or invalid
    if (benefits.length === 0) {
        benefits = [
            copy("Analyses limitées"),
            copy("Pas d'alertes live"),
            copy("Support standard")
        ];
    }

    const handleAction = () => {
        router.push(`/${locale}/profile/subscription`);
    };

    return (
        <div className="relative group overflow-hidden rounded-3xl border border-white/10 bg-black/40 backdrop-blur-xl">
            {/* Decor */}
            <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity duration-700">
                <Sparkles className="size-48 rotate-12" />
            </div>

            <div className="p-6 sm:p-8 flex flex-col md:flex-row gap-8 items-start md:items-center justify-between relative z-10">

                {/* Left: Plan Info */}
                <div className="space-y-4 max-w-md">
                    <div className="flex items-center gap-3">
                        <div className={cn("size-10 rounded-xl flex items-center justify-center border",
                            isPremium ? "bg-amber-500/10 border-amber-500/20 text-amber-500" : "bg-neutral-800 border-white/10"
                        )}>
                            <CrownIcon isPremium={isPremium} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                                {planName}
                            </h3>
                            {isPremium && <Badge className="bg-amber-500 text-black font-bold text-[10px] uppercase">{copy("Actif")}</Badge>}
                            <p className="text-sm text-neutral-400">
                                {isPremium && subscription?.current_period_end
                                    ? `${copy("Renouvellement le")} ${new Date(subscription.current_period_end).toLocaleDateString(locale)}`
                                    : copy("Passez au niveau supérieur")}
                            </p>
                        </div>
                    </div>

                    {/* Benefits List (Show only 3 max for compact view) */}
                    <div className="flex flex-wrap gap-x-6 gap-y-2">
                        {benefits.slice(0, 3).map((benefit: string | { text: string; included?: boolean }, i: number) => {
                            const text = typeof benefit === 'string' ? benefit : benefit.text;
                            return (
                                <div key={i} className="flex items-center gap-2 text-xs font-medium text-neutral-300">
                                    <Check className={cn("size-3.5", isPremium ? "text-amber-500" : "text-neutral-500")} />
                                    <span>{text}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Right: Actions */}
                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                    <Button
                        onClick={handleAction}
                        className={cn("w-full md:w-auto font-bold tracking-wide",
                            isPremium
                                ? "bg-white/5 border border-white/10 hover:bg-white/10 text-white"
                                : "bg-amber-500 hover:bg-amber-600 text-black shadow-[0_0_20px_-5px_rgba(245,158,11,0.5)]"
                        )}>
                        {isPremium ? copy("Gérer l'abonnement") : copy("Passer Premium")}
                    </Button>
                </div>

            </div>

            {/* Progress Bar (Visual Flair) */}
            <div className="h-1 w-full bg-white/5">
                <div className={cn("h-full transition-all duration-1000", isPremium ? "w-full bg-amber-500/50" : "w-[5%] bg-blue-500/50")} />
            </div>
        </div>
    );
}

function CrownIcon({ isPremium }: { isPremium: boolean }) {
    if (isPremium) return <Sparkles className="size-5" />;
    return <CreditCard className="size-5" />;
}
