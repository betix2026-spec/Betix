"use client";

import { usePathname, useRouter } from "next/navigation";
import { Globe2 } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
    LOCALE_LABELS,
    SUPPORTED_LOCALES,
    getLocaleFromPath,
    stripLocaleFromPath,
    withLocale,
    type Locale,
} from "@/lib/i18n";

export function LanguageSwitcher() {
    const pathname = usePathname();
    const router = useRouter();
    const activeLocale = getLocaleFromPath(pathname) || "fr";

    const switchLocale = (locale: Locale) => {
        router.push(withLocale(stripLocaleFromPath(pathname), locale));
        router.refresh();
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
                    <Globe2 className="size-4" />
                    <span className="hidden sm:inline">{activeLocale.toUpperCase()}</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-neutral-950/95 border-white/10">
                {SUPPORTED_LOCALES.map((locale) => (
                    <DropdownMenuItem
                        key={locale}
                        onClick={() => switchLocale(locale)}
                        className="cursor-pointer gap-2"
                    >
                        <span className="w-6 font-mono text-xs uppercase text-neutral-500">{locale}</span>
                        <span>{LOCALE_LABELS[locale]}</span>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
