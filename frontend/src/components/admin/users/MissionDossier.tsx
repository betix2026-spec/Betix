"use client";

import { AdminUser } from "@/types/admin";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
    Activity,
    Calendar,
    Crown,
    Mail,
    TrendingUp,
    ShieldCheck,
    MessageSquare,
    MoreVertical,
    Shield,
    User,
    Wifi,
    CreditCard,
    XCircle,
    Loader2,
    AlertTriangle
} from "lucide-react";
import { getPlansAction, cancelSubscriptionAction, getSubscriptionDetailsAction } from "@/app/(admin)/admin/users/actions";
import { useState, useEffect } from "react";
import { useI18n } from "@/lib/use-i18n";

interface MissionDossierProps {
    user: AdminUser | null;
    open: boolean;
    onClose: () => void;
    onSubscriptionCancelled?: () => void;
}

export function MissionDossier({ user, open, onClose, onSubscriptionCancelled }: MissionDossierProps) {
    const { copy, t, locale } = useI18n();
    const [plans, setPlans] = useState<any[]>([]);
    const [cancelConfirm, setCancelConfirm] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [cancelResult, setCancelResult] = useState<{ success: boolean; message: string } | null>(null);
    const [billingInfo, setBillingInfo] = useState<any>(null);
    const [billingLoading, setBillingLoading] = useState(false);

    useEffect(() => {
        if (open && user?.id) {
            getPlansAction().then(result => {
                if (result.success && result.data) {
                    setPlans(result.data);
                }
            });
            setCancelConfirm(false);
            setCancelResult(null);

            // Fetch Stripe billing details
            setBillingInfo(null);
            setBillingLoading(true);
            getSubscriptionDetailsAction(user.id).then(result => {
                if (result.success && result.data) {
                    setBillingInfo(result.data);
                }
            }).finally(() => setBillingLoading(false));
        }
    }, [open, user?.id]);

    if (!user) return null;

    const canCancel = (user.status === 'active' || user.status === 'past_due' || user.status === 'trialing')
        && user.plan_id !== 'no_subscription';

    const handleCancelSubscription = async () => {
        setCancelling(true);
        setCancelResult(null);
        try {
            const result = await cancelSubscriptionAction(user.id);
            setCancelResult({
                success: result.success,
                message: result.success
                    ? (result.message || copy('Abonnement annulé.'))
                    : (result.error || copy('Erreur inconnue.'))
            });
            if (result.success) {
                setCancelConfirm(false);
                onSubscriptionCancelled?.();
            }
        } catch {
            setCancelResult({ success: false, message: copy('Erreur réseau.') });
        } finally {
            setCancelling(false);
        }
    };

    const riskLevel = user.status === "churned" ? "CRITICAL" : user.status === "suspended" ? "HIGH" : "LOW";
    const riskColor = riskLevel === "CRITICAL" ? "text-red-500" : riskLevel === "HIGH" ? "text-amber-500" : "text-emerald-500";

    return (
        <Sheet open={open} onOpenChange={onClose}>
            <SheetContent className="w-full sm:max-w-xl border-l border-white/10 bg-black/95 backdrop-blur-xl p-0 shadow-2xl">
                <SheetHeader className="sr-only">
                    <SheetTitle>{t("adminUserDetailsTitle")}: {user.name}</SheetTitle>
                    <SheetDescription>{t("adminUserDetailsDescription")}: {user.name}</SheetDescription>
                </SheetHeader>
                {/* Header Image / Pattern */}
                <div className="h-32 bg-[url('https://images.unsplash.com/photo-1550751827-4bd374c3f58b?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center relative group">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-[2px]" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />

                    {/* Floating ID */}
                    <div className="absolute top-4 right-4 font-mono text-[10px] text-white/30 tracking-widest">
                        ID: {user.id.toUpperCase()}
                    </div>
                </div>

                <div className="px-6 relative -mt-12">
                    <div className="flex justify-between items-end">
                        <Avatar className="size-24 border-4 border-black shadow-2xl rounded-2xl">
                            {user.avatar && (
                                <img
                                    src={user.avatar}
                                    alt={user.name}
                                    className="size-full object-cover rounded-2xl"
                                />
                            )}
                            <AvatarFallback className="bg-neutral-900 text-2xl font-bold text-white rounded-2xl">
                                {user.name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                        </Avatar>
                        <div className="mb-2 space-x-2">
                            <Button size="sm" variant="outline" className="h-8 border-white/10 bg-white/5 hover:bg-white/10 text-xs">
                                <Mail className="size-3.5 mr-2" /> {copy("Message")}
                            </Button>
                            <Button size="sm" className="h-8 bg-blue-600 hover:bg-blue-700 text-xs font-bold">
                                <Shield className="size-3.5 mr-2" /> {copy("Actions")}
                            </Button>
                        </div>
                    </div>

                    <div className="mt-4">
                        <h2 className="text-2xl font-black text-white tracking-tight">{user.name}</h2>
                        <div className="flex items-center gap-3 text-sm text-neutral-400 mt-1">
                            <span className="flex items-center gap-1.5"><Mail className="size-3.5" /> {user.email}</span>
                            <span className="w-1 h-1 rounded-full bg-neutral-600" />
                            <span className="flex items-center gap-1.5"><Calendar className="size-3.5" /> {copy("Depuis le")} {user.joinDate}</span>
                        </div>
                    </div>

                    {/* Status Grid */}
                    <div className="grid grid-cols-3 gap-3 mt-8">
                        <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-center">
                            <p className="text-[10px] uppercase font-bold text-neutral-500 mb-1">{copy("Status")}</p>
                            <Badge variant="outline" className={cn("h-6 border-0 bg-transparent px-0 mx-auto",
                                user.status === "active" ? "text-emerald-400" : "text-red-400"
                            )}>
                                {user.status.toUpperCase()}
                            </Badge>
                        </div>
                        <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-center">
                            <p className="text-[10px] uppercase font-bold text-neutral-500 mb-1">{copy("Role")}</p>
                            <span className={cn("font-black tracking-wider text-sm",
                                user.role === "admin" ? "text-blue-400" : user.role === "premium" ? "text-amber-400" : "text-neutral-300"
                            )}>
                                {user.role.toUpperCase()}
                            </span>
                        </div>
                        <div className="p-3 rounded-xl bg-white/5 border border-white/5 text-center">
                            <p className="text-[10px] uppercase font-bold text-neutral-500 mb-1">{copy("Risk Level")}</p>
                            <span className={cn("font-black tracking-wider text-sm", riskColor)}>
                                {riskLevel}
                            </span>
                        </div>
                    </div>

                    {/* Subscription Section */}
                    <div className="space-y-4 mb-8">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-500 flex items-center gap-2">
                            <CreditCard className="size-3.5" /> {t("adminSubscriptionSection")}
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                                <p className="text-[10px] font-mono text-neutral-500 mb-1">{t("adminCurrentPlanLabel")}</p>
                                <p className="text-sm font-bold text-white">
                                    {(plans.find(p => p.id === user.plan_id)?.name) || user.plan_id || t("adminNoPlanLabel")}
                                </p>
                            </div>
                            <div className="p-4 rounded-xl bg-white/5 border border-white/5">
                                <p className="text-[10px] font-mono text-neutral-500 mb-1">{t("adminSubStatusLabel")}</p>
                                <div className="flex items-center gap-2">
                                    <div className={cn("size-2 rounded-full animate-pulse",
                                        user.status === 'active' ? "bg-emerald-500" : "bg-neutral-500"
                                    )} />
                                    <p className="text-sm font-bold text-white uppercase">{copy(user.status || "Unknown")}</p>
                                </div>
                            </div>
                        </div>

                        {/* Stripe Billing Intel */}
                        {billingLoading && (
                            <div className="flex items-center gap-2 mt-3 text-neutral-500">
                                <Loader2 className="size-3 animate-spin" />
                                <span className="text-[10px] font-mono">{t("adminLoadingBilling")}</span>
                            </div>
                        )}

                        {billingInfo?.stripe && (
                            <div className="mt-3 p-3 rounded-xl bg-blue-500/5 border border-blue-500/15 space-y-2">
                                <p className="text-[10px] font-mono font-bold text-blue-400 uppercase tracking-widest">{copy("Stripe Billing")}</p>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <p className="text-[9px] font-mono text-neutral-500">{t("adminStatusLabel")}</p>
                                        <p className={cn("text-xs font-bold uppercase",
                                            billingInfo.stripe.status === 'active' ? "text-emerald-400" :
                                            billingInfo.stripe.status === 'canceled' ? "text-red-400" : "text-amber-400"
                                        )}>
                                            {billingInfo.stripe.status}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-mono text-neutral-500">{t("adminBillingAmountLabel")}</p>
                                        <p className="text-xs font-bold text-white">
                                            {billingInfo.stripe.amount} {billingInfo.stripe.currency} / {billingInfo.stripe.interval}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[9px] font-mono text-neutral-500">{t("adminBillingCreatedLabel")}</p>
                                        <p className="text-xs text-neutral-300">
                                            {new Date(billingInfo.stripe.createdAt).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })}
                                        </p>
                                    </div>
                                    {billingInfo.stripe.currentPeriodEnd ? (
                                        <div>
                                            <p className="text-[9px] font-mono text-neutral-500">{t("adminBillingNextChargeLabel")}</p>
                                            <p className="text-xs font-bold text-amber-400">
                                                {new Date(billingInfo.stripe.currentPeriodEnd).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </p>
                                        </div>
                                    ) : billingInfo.stripe.canceledAt ? (
                                        <div>
                                            <p className="text-[9px] font-mono text-neutral-500">{t("adminBillingCanceledLabel")}</p>
                                            <p className="text-xs text-red-400">
                                                {new Date(billingInfo.stripe.canceledAt).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </p>
                                        </div>
                                    ) : null}
                                </div>
                                <p className="text-[9px] font-mono text-neutral-600 pt-1">{billingInfo.stripe.id}</p>
                            </div>
                        )}

                        {billingInfo && !billingInfo.stripe && billingInfo.source === 'manual_gift' && (
                            <div className="mt-3 p-2 rounded-lg bg-purple-500/5 border border-purple-500/15">
                                <p className="text-[10px] font-mono text-purple-400">{copy("Abonnement offert manuellement (pas de facturation Stripe)")}</p>
                            </div>
                        )}

                        {/* Cancel Subscription */}
                        {canCancel && !cancelConfirm && (
                            <Button
                                variant="outline"
                                size="sm"
                                className="w-full mt-3 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 font-mono text-xs gap-2"
                                onClick={() => setCancelConfirm(true)}
                            >
                                <XCircle className="size-3.5" /> {t("cancelSubscription")}
                            </Button>
                        )}

                        {cancelConfirm && (
                            <div className="mt-3 p-3 rounded-xl bg-red-500/5 border border-red-500/20 space-y-3">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="size-4 text-red-400 mt-0.5 shrink-0" />
                                    <p className="text-xs text-red-300 leading-relaxed">
                                        {copy("Résilier l'abonnement de")} <strong>{user.name}</strong> ?
                                        {copy("L'accès premium sera coupé immédiatement et l'abonnement Stripe annulé.")}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="flex-1 h-8 border-white/10 text-neutral-400 hover:bg-white/5 text-xs"
                                        onClick={() => setCancelConfirm(false)}
                                        disabled={cancelling}
                                    >
                                        {t("adminCancelButton")}
                                    </Button>
                                    <Button
                                        size="sm"
                                        className="flex-1 h-8 bg-red-600 hover:bg-red-700 text-white text-xs font-bold gap-2"
                                        onClick={handleCancelSubscription}
                                        disabled={cancelling}
                                    >
                                        {cancelling ? <Loader2 className="size-3.5 animate-spin" /> : <XCircle className="size-3.5" />}
                                        {cancelling ? t("confirmingCancellation") : copy("Confirmer")}
                                    </Button>
                                </div>
                            </div>
                        )}

                        {cancelResult && (
                            <div className={cn("mt-2 p-2 rounded-lg text-xs font-mono",
                                cancelResult.success
                                    ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                                    : "bg-red-500/10 border border-red-500/20 text-red-400"
                            )}>
                                {cancelResult.message}
                            </div>
                        )}
                    </div>

                    <Separator className="my-8 bg-white/10" />

                    {/* Detailed Intel */}
                    <div className="space-y-6">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-500 flex items-center gap-2">
                            <Activity className="size-3.5" /> {copy("Activity Log")}
                        </h3>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between group">
                                <div className="flex items-center gap-3">
                                    <div className="size-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                                        <Wifi className="size-4" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-white">{copy("Dernière Connexion")}</p>
                                        <p className="text-xs text-neutral-500">{user.lastActive}</p>
                                    </div>
                                </div>
                                <span className="text-xs font-mono text-neutral-600">IP: 192.168.1.x</span>
                            </div>

                            {/* Detailed Stats — Only for Users, not Admins */}
                            {user.role !== 'admin' && user.role !== 'super_admin' ? (
                                <div className="space-y-4 pt-4 border-t border-white/5">
                                    <div className="flex items-center justify-between group">
                                        <div className="flex items-center gap-3">
                                            <div className="size-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                                                <TrendingUp className="size-4" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-white">{copy("Win Rate Global")}</p>
                                                <p className="text-xs text-neutral-500">{copy("Basé sur")} {user.totalPredictions} {copy("pronostics")}</p>
                                            </div>
                                        </div>
                                        <span className="text-xl font-black text-white tracking-tighter">{user.win_rate !== undefined ? `${user.win_rate}%` : "68%"}</span>
                                    </div>

                                    <div className="flex items-center justify-between group">
                                        <div className="flex items-center gap-3">
                                            <div className="size-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                                                <ShieldCheck className="size-4" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-white">{copy("Sport Favori")}</p>
                                                <p className="text-xs text-neutral-500">{t("adminPrimarySportLabel")}</p>
                                            </div>
                                        </div>
                                        <span className="text-sm font-bold text-white uppercase tracking-widest">{user.favoriteSport}</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="pt-4 border-t border-white/5">
                                    <div className="p-4 rounded-xl bg-purple-500/5 border border-purple-500/10">
                                        <p className="text-xs font-mono text-purple-400 uppercase tracking-widest mb-1">{t("adminAccessLevelLabel")}</p>
                                        <p className="text-sm text-neutral-400 leading-relaxed italic">
                                            {user.role === 'super_admin' ? t("adminUserHasSuperAdminPrivileges") : t("adminUserHasAdminPrivileges")}{" "}
                                            {t("adminSupervisionStatsNote")}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Admin Notes */}
                    <div className="mt-8 p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/10">
                        <h4 className="text-xs font-bold text-yellow-500 mb-2 uppercase tracking-wide">{copy("Admin Notes")}</h4>
                        <p className="text-xs text-neutral-400 leading-relaxed">
                            {copy("Utilisateur actif et engagé. A contacté le support 2 fois pour des questions sur l'API. Potentiel upgrade vers plan Annuel si on lui propose une offre.")}
                        </p>
                    </div>

                </div>
            </SheetContent>
        </Sheet>
    );
}
