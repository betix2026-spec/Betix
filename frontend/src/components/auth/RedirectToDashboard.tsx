"use client";

import { useEffect } from "react";
import { useI18n } from "@/lib/use-i18n";

export function RedirectToDashboard() {
    const { locale, t } = useI18n();

    useEffect(() => {
        // Soft Redirect: Ensures cookies are accepted by browser before navigating.
        // We use window.location.replace to force a full reload and clear any stale Next cache.
        console.log("[RedirectToDashboard] Executing atomic redirect...");
        window.location.replace(`/${locale}/dashboard`);
    }, [locale]);

    return (
        <div className="flex items-center justify-center min-h-screen bg-black">
            <div className="flex flex-col items-center gap-4">
                <div className="size-12 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
                <p className="text-neutral-400 text-sm animate-pulse">{t("secureRedirect")}</p>
            </div>
        </div>
    );
}
