import { headers } from "next/headers";
import { DEFAULT_LOCALE, isLocale, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";

export async function getServerLocale(): Promise<Locale> {
    const requestHeaders = await headers();
    const headerLocale = requestHeaders.get("x-betix-locale");
    return isLocale(headerLocale) ? headerLocale : DEFAULT_LOCALE;
}

export function getLocaleFromRequest(request: Request): Locale {
    const headerLocale = request.headers.get("x-betix-locale");
    if (isLocale(headerLocale)) return headerLocale;

    const cookieLocale = request.headers
        .get("cookie")
        ?.split(";")
        .map((value) => value.trim())
        .find((value) => value.startsWith("NEXT_LOCALE="))
        ?.split("=")[1];
    if (isLocale(cookieLocale)) return cookieLocale;

    const acceptedLanguages = request.headers.get("accept-language") || "";
    for (const part of acceptedLanguages.split(",")) {
        const language = part.split(";")[0]?.trim().toLowerCase();
        const base = language?.split("-")[0];
        const match = SUPPORTED_LOCALES.find((locale) => locale === base);
        if (match) return match;
    }

    return DEFAULT_LOCALE;
}
