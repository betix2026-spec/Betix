"use client";

import { useState } from "react";
import { AccessTerminal } from "@/components/auth/AccessTerminal";
import { BiometricInput } from "@/components/auth/BiometricInput";
import { SecurityScanner } from "@/components/auth/SecurityScanner";
import { ShieldCheck, MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import { useI18n } from "@/lib/use-i18n";

export default function MFAPage() {
    const { locale, t, copy } = useI18n();
    const [isLoading, setIsLoading] = useState(false);
    const [code, setCode] = useState("");
    const [error, setError] = useState<string | null>(null);
    const supabase = createClient();

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const { data: factors } = await supabase.auth.mfa.listFactors();
            const factor = factors?.all?.find(f => f.status === 'verified');

            if (!factor) {
                toast.error(t("noMfaFactor"));
                setIsLoading(false);
                return;
            }

            const challenge = await supabase.auth.mfa.challenge({ factorId: factor.id });
            if (challenge.error) throw challenge.error;

            const verify = await supabase.auth.mfa.verify({
                factorId: factor.id,
                challengeId: challenge.data.id,
                code: code
            });

            if (verify.error) throw verify.error;

            toast.success(t("securityValidated"), { description: t("dashboardAccessGranted") });
            window.location.replace(`/${locale}/dashboard`);
        } catch (err: unknown) {
            console.error("MFA Error:", err);
            const message = err instanceof Error ? err.message : t("invalidCode");
            setError(message);
            toast.error(t("validationFailed"), { description: message });
            setIsLoading(false);
        }
    };

    return (
        <AccessTerminal type="login">
            <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center p-3 rounded-full bg-blue-500/10 border border-blue-500/20 mb-4">
                    <ShieldCheck className="size-8 text-blue-400" />
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight uppercase">{copy("MFA Required")}</h2>
                <p className="text-sm text-neutral-500 mt-2">
                    {copy("Enter the code from your authenticator app to authorize session.")}
                </p>
            </div>

            <form onSubmit={handleVerify} className="space-y-6">
                <BiometricInput
                    label={copy("Verification Code")}
                    type="text"
                    icon={MessageSquare}
                    placeholder="000000"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                />

                {error && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                        <p className="text-[10px] text-red-500 font-bold uppercase tracking-wider text-center">
                            {error}
                        </p>
                    </div>
                )}

                <SecurityScanner
                    type="submit"
                    isLoading={isLoading}
                    label={copy("VERIFY CLEARANCE")}
                />
            </form>

            <div className="text-center mt-8">
                <button
                    onClick={() => supabase.auth.signOut().then(() => window.location.replace(`/${locale}/login`))}
                    className="text-[10px] text-neutral-500 hover:text-white font-bold uppercase tracking-widest transition-colors"
                >
                    {t("backToLogin")}
                </button>
            </div>
        </AccessTerminal>
    );
}
