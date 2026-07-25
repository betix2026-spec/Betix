"use client";

import { AccessTerminal } from "@/components/auth/AccessTerminal";
import { BiometricInput } from "@/components/auth/BiometricInput";
import { SecurityScanner } from "@/components/auth/SecurityScanner";
import { ArrowLeft, CheckCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { toast } from "sonner";
import { useI18n } from "@/lib/use-i18n";

export default function ResetPasswordPage() {
    const { t, locale } = useI18n();
    const [isLoading, setIsLoading] = useState(false);
    const [email, setEmail] = useState("");
    const [emailSent, setEmailSent] = useState(false);
    const { resetPasswordForEmail } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        const { error } = await resetPasswordForEmail(email);

        if (error) {
            toast.error(t("updateFailed"), {
                description: error,
            });
            setIsLoading(false);
            return;
        }

        setEmailSent(true);
        setIsLoading(false);
    };

    return (
        <AccessTerminal type="reset">
            {emailSent ? (
                <div className="text-center space-y-4 py-4">
                    <div className="flex justify-center">
                        <div className="size-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
                            <CheckCircle className="size-8 text-emerald-400" />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-lg font-semibold text-white">{t("emailSentTitle")}</h3>
                        <p className="text-sm text-neutral-400 leading-relaxed">
                            {t("resetIfExists")} <span className="text-white font-medium">{email}</span>
                        </p>
                    </div>
                    <p className="text-xs text-neutral-500 mt-4">{t("checkSpam")}</p>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                    <BiometricInput
                        label={t("emailAddress")}
                        type="email"
                        placeholder="votre@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />

                    <SecurityScanner type="submit" isLoading={isLoading} label={t("sendLink")} />
                </form>
            )}

            <div className="text-center mt-8">
                <Link href={`/${locale}/login`} className="text-sm text-neutral-400 hover:text-white flex items-center justify-center gap-2 transition-colors">
                    <ArrowLeft className="size-4" />
                    {t("backToLogin")}
                </Link>
            </div>
        </AccessTerminal>
    );
}
