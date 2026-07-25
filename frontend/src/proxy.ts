import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

const SUPPORTED_LOCALES = ["fr", "en", "es", "de"] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];

const DEFAULT_LOCALE: Locale = "fr";
const LOCALE_COOKIE = "NEXT_LOCALE";
const PUBLIC_FILE = /\.(.*)$/;

function isLocale(value: string | undefined | null): value is Locale {
    return SUPPORTED_LOCALES.includes(value as Locale);
}

function localeFromAcceptLanguage(header: string | null): Locale | null {
    if (!header) return null;

    const languages = header
        .split(",")
        .map((item) => item.trim().split(";")[0]?.toLowerCase().split("-")[0])
        .filter(Boolean);

    return languages.find(isLocale) ?? null;
}

function localeFromCountry(country: string | null): Locale | null {
    const normalized = country?.toUpperCase();
    if (!normalized) return null;
    if (["FR", "BE", "LU", "MC", "CH"].includes(normalized)) return "fr";
    if (["ES", "MX", "AR", "CL", "CO", "PE", "UY"].includes(normalized)) return "es";
    if (["DE", "AT"].includes(normalized)) return "de";
    if (["US", "GB", "IE", "CA", "AU", "NZ"].includes(normalized)) return "en";
    return null;
}

function detectLocale(request: NextRequest): Locale {
    const saved = request.cookies.get(LOCALE_COOKIE)?.value;
    if (isLocale(saved)) return saved;

    return (
        localeFromAcceptLanguage(request.headers.get("accept-language")) ||
        localeFromCountry(request.headers.get("x-vercel-ip-country")) ||
        DEFAULT_LOCALE
    );
}

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (
        pathname.startsWith("/_next") ||
        pathname.startsWith("/api") ||
        pathname === "/favicon.ico" ||
        PUBLIC_FILE.test(pathname)
    ) {
        return NextResponse.next();
    }

    const pathLocale = pathname.split("/").filter(Boolean)[0];
    const activeLocale = isLocale(pathLocale) ? pathLocale : detectLocale(request);
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-betix-locale", activeLocale);

    let response: NextResponse;

    if (!isLocale(pathLocale)) {
        const url = request.nextUrl.clone();
        url.pathname = pathname === "/" ? `/${activeLocale}` : `/${activeLocale}${pathname}`;
        response = NextResponse.redirect(url);
    } else {
        const url = request.nextUrl.clone();
        url.pathname = pathname.replace(`/${activeLocale}`, "") || "/";
        response = NextResponse.rewrite(url, {
            request: { headers: requestHeaders },
        });
    }

    response.cookies.set(LOCALE_COOKIE, activeLocale, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
    });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                    cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
                },
            },
        }
    );

    await supabase.auth.getUser();
    return response;
}

export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};
