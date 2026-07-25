"use client";

import { useCallback } from "react";
import { usePathname } from "next/navigation";
import { copy as translateCopy, getLocaleFromPath, t as translateKey, type DictionaryKey } from "@/lib/i18n";

export function useI18n() {
    const pathname = usePathname();
    const locale = getLocaleFromPath(pathname) || "fr";
    const t = useCallback((key: DictionaryKey) => translateKey(locale, key), [locale]);
    const copy = useCallback((source: string) => translateCopy(locale, source), [locale]);

    return {
        locale,
        t,
        copy,
    };
}
