"use client";

import { useState, useEffect } from "react";
import { Shield, Lock, ShieldAlert, CheckCircle2, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { BiometricInput } from "@/components/auth/BiometricInput";
import { SecurityScanner } from "@/components/auth/SecurityScanner";
import { useI18n } from "@/lib/use-i18n";

export function MFASettings() {
    const { copy, t } = useI18n();
    const [isLoading, setIsLoading] = useState(true);
    const [isEnrolling, setIsEnrolling] = useState(false);
    const [factors, setFactors] = useState<any[]>([]);
    const [enrollData, setEnrollData] = useState<any>(null);
    const [verifyCode, setVerifyCode] = useState("");
    const [isVerifying, setIsVerifying] = useState(false);

    const supabase = createClient();

    const fetchFactors = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase.auth.mfa.listFactors();
            if (error) throw error;
            setFactors(data.all || []);
        } catch (err) {
            console.error("MFA List Error:", err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchFactors();
    }, []);

    const startEnroll = async () => {
        try {
            const { data, error } = await supabase.auth.mfa.enroll({
                factorType: 'totp',
                issuer: 'BETIX',
                friendlyName: 'Agent Device'
            });
            if (error) throw error;
            setEnrollData(data);
            setIsEnrolling(true);
        } catch (err: any) {
            toast.error(t("mfaEnrollFailed"), { description: err.message });
        }
    };

    const confirmEnroll = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsVerifying(true);
        try {
            const challenge = await supabase.auth.mfa.challenge({ factorId: enrollData.id });
            if (challenge.error) throw challenge.error;

            const verify = await supabase.auth.mfa.verify({
                factorId: enrollData.id,
                challengeId: challenge.data.id,
                code: verifyCode
            });

            if (verify.error) throw verify.error;

            toast.success(t("mfaEnabledToast"), { description: t("mfaEnabledToastDescription") });
            setIsEnrolling(false);
            setEnrollData(null);
            setVerifyCode("");
            fetchFactors();
        } catch (err: any) {
            toast.error(t("invalidCode"), { description: err.message });
        } finally {
            setIsVerifying(false);
        }
    };

    const unenroll = async (factorId: string) => {
        if (!confirm(copy("Voulez-vous vraiment désactiver la double authentification ? Cela réduira votre niveau de sécurité."))) return;

        try {
            const { error } = await supabase.auth.mfa.unenroll({ factorId });
            if (error) throw error;
            toast.success(t("mfaDisabledToast"));
            fetchFactors();
        } catch (err: any) {
            toast.error(copy("Erreur"), { description: err.message });
        }
    };

    const activeFactor = factors.find(f => f.status === 'verified');

    if (isLoading) return (
        <div className="flex items-center justify-center p-8 bg-white/5 rounded-3xl border border-white/10 italic text-neutral-500 text-xs">
            <Loader2 className="size-4 animate-spin mr-2" /> {copy("Synchro sécurité...")}
        </div>
    );

    return (
        <div className="p-6 rounded-3xl bg-blue-500/5 border border-blue-500/10 backdrop-blur-xl space-y-4">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-bold uppercase tracking-widest text-blue-400 flex items-center gap-2">
                    <Shield className="size-4" /> {t("mfaSectionTitle")}
                </h3>
                {activeFactor ? (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-black text-emerald-500 uppercase tracking-tighter">
                        <CheckCircle2 className="size-3" /> {t("mfaStatusEnabled")}
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] font-black text-amber-500 uppercase tracking-tighter">
                        <ShieldAlert className="size-3" /> {t("mfaStatusDisabled")}
                    </div>
                )}
            </div>

            <p className="text-xs text-neutral-500 leading-relaxed">
                {t("mfaSectionDescription")}
            </p>

            <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
                {!activeFactor ? (
                    !isEnrolling ? (
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="size-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                                    <Lock className="size-5 text-blue-400" />
                                </div>
                                <div>
                                    <p className="font-medium text-white text-sm">{t("mfaAuthenticatorLabel")}</p>
                                    <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-widest">{copy("TOTP (Google/Authy)")}</p>
                                </div>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20 text-[10px] font-black uppercase tracking-widest"
                                onClick={startEnroll}
                            >
                                {t("mfaEnableButton")}
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-black uppercase tracking-widest text-white">{t("mfaSetupTitle")}</span>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-neutral-500" onClick={() => setIsEnrolling(false)}>
                                    <X className="size-3" />
                                </Button>
                            </div>

                            <div className="flex flex-col items-center gap-6 py-2">
                                {/* The QR Code Container */}
                                <div className="p-3 bg-white rounded-xl shadow-[0_0_30px_rgba(255,255,255,0.1)]">
                                    <img
                                        src={enrollData?.totp?.qr_code}
                                        alt="MFA QR Code"
                                        className="size-40 image-pixel-art"
                                    />
                                </div>

                                <div className="text-center space-y-2">
                                    <p className="text-[11px] text-neutral-400 text-center max-w-[200px]">
                                        {copy("Scannez ce code avec votre application de sécurité.")}
                                    </p>
                                    <code className="text-[9px] bg-white/5 px-2 py-1 rounded text-blue-400 select-all cursor-pointer">
                                        {copy("Secret")}: {enrollData?.totp?.secret.slice(0, 10)}...
                                    </code>
                                </div>

                                <form onSubmit={confirmEnroll} className="w-full space-y-4">
                                    <BiometricInput
                                        label={t("mfaSixDigitLabel")}
                                        placeholder="000 000"
                                        value={verifyCode}
                                        onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        required
                                    />
                                    <SecurityScanner
                                        type="submit"
                                        isLoading={isVerifying}
                                        label={t("mfaConfirmButton")}
                                    />
                                </form>
                            </div>
                        </div>
                    )
                ) : (
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="size-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                                <Shield className="size-5 text-emerald-400" />
                            </div>
                            <div>
                                <p className="font-medium text-white text-sm">{t("mfaActiveLabel")}</p>
                                <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-widest tracking-widest">{t("mfaActiveDescription")}</p>
                            </div>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            className="h-8 border-red-500/20 text-red-500 hover:bg-red-500/10 text-[10px] font-black uppercase tracking-widest"
                            onClick={() => unenroll(activeFactor.id)}
                        >
                            {t("mfaDisableButton")}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
