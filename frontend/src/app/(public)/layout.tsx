import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BetixLogo } from "@/components/ui/betix-logo";
import { Menu, X, LayoutDashboard, Trophy, CreditCard, LogIn, ArrowRight } from "lucide-react";
import { FootballIcon, BasketballIcon, TennisIcon } from "@/components/icons/SportIcons";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { getServerLocale } from "@/lib/i18n-server";
import { t } from "@/lib/i18n";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
    SheetClose,
} from "@/components/ui/sheet";

export default async function PublicLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const locale = await getServerLocale();

    return (
        <div className="min-h-screen flex flex-col">
            {/* ===== NAVBAR PUBLIC ===== */}
            <header className="sticky top-0 z-50 w-full glassmorphism">
                <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
                    {/* Logo */}
                    <Link href={`/${locale}`} className="flex items-center gap-2">
                        <BetixLogo className="h-8" />
                    </Link>

                    {/* Nav Links — hidden on mobile */}
                    <nav className="hidden md:flex items-center gap-6">
                        <Link
                            href={`/${locale}#features`}
                            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                            {t(locale, "navFeatures")}
                        </Link>
                        <Link
                            href={`/${locale}#sports`}
                            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                            {t(locale, "navSports")}
                        </Link>
                        <Link
                            href={`/${locale}#pricing`}
                            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                        >
                            {t(locale, "navPricing")}
                        </Link>
                    </nav>

                    {/* CTA Buttons & Mobile Menu */}
                    <div className="flex items-center gap-2 sm:gap-4">
                        <LanguageSwitcher />
                        <Link href={`/${locale}/login`} className="hidden text-sm font-medium text-muted-foreground hover:text-foreground transition-colors sm:block">
                            {t(locale, "signIn")}
                        </Link>
                        <Link href={`/${locale}/signup`}>
                            <Button size="sm" className="gradient-accent text-white border-0 h-9 px-4 sm:px-5">
                                {t(locale, "start")}
                            </Button>
                        </Link>

                        {/* Mobile Menu */}
                        <div className="md:hidden">
                            <Sheet>
                                <SheetTrigger asChild>
                                    <Button variant="ghost" size="icon" className="ml-1 text-muted-foreground hover:text-foreground">
                                        <Menu className="size-5" />
                                    </Button>
                                </SheetTrigger>
                                <SheetContent side="right" className="w-[85vw] max-w-[400px] border-l border-white/10 bg-black/95 backdrop-blur-xl p-0">
                                    <SheetHeader className="p-6 border-b border-white/5">
                                        <div className="flex items-center gap-2">
                                            <SheetTitle className="flex items-center">
                                                <BetixLogo className="h-8 w-auto" />
                                                <span className="sr-only">{t(locale, "mainMenu")}</span>
                                            </SheetTitle>
                                        </div>
                                    </SheetHeader>

                                    <div className="flex flex-col gap-2 p-6 mt-2">
                                        <SheetClose asChild>
                                            <Link href={`/${locale}#features`} className="flex items-center gap-4 px-4 py-3 rounded-xl text-lg font-medium text-white/80 hover:text-white hover:bg-white/5 transition-all">
                                                <LayoutDashboard className="size-5 text-primary" />
                                                {t(locale, "navFeatures")}
                                            </Link>
                                        </SheetClose>
                                        <SheetClose asChild>
                                            <Link href={`/${locale}#sports`} className="flex items-center gap-4 px-4 py-3 rounded-xl text-lg font-medium text-white/80 hover:text-white hover:bg-white/5 transition-all">
                                                <Trophy className="size-5 text-emerald-400" />
                                                {t(locale, "navSports")}
                                            </Link>
                                        </SheetClose>
                                        <SheetClose asChild>
                                            <Link href={`/${locale}#pricing`} className="flex items-center gap-4 px-4 py-3 rounded-xl text-lg font-medium text-white/80 hover:text-white hover:bg-white/5 transition-all">
                                                <CreditCard className="size-5 text-purple-400" />
                                                {t(locale, "navPricing")}
                                            </Link>
                                        </SheetClose>

                                        <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent my-4" />

                                        <SheetClose asChild>
                                            <Link href={`/${locale}/login`} className="flex items-center gap-4 px-4 py-3 rounded-xl text-lg font-medium text-muted-foreground hover:text-white hover:bg-white/5 transition-all">
                                                <LogIn className="size-5" />
                                                {t(locale, "signIn")}
                                            </Link>
                                        </SheetClose>

                                        <SheetClose asChild>
                                            <Link href={`/${locale}/signup`} className="mt-4 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-lg font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 shadow-[0_0_20px_-5px_rgba(79,70,229,0.5)] transition-all hover:scale-[1.02] border-0">
                                                {t(locale, "start")}
                                                <ArrowRight className="size-5 text-white/80" />
                                            </Link>
                                        </SheetClose>
                                    </div>
                                </SheetContent>
                            </Sheet>
                        </div>
                    </div>
                </div>
            </header>

            {/* ===== MAIN CONTENT ===== */}
            <main className="flex-1">{children}</main>

            {/* ===== FOOTER ===== */}
            <footer className="border-t border-border/50 bg-card/30">
                <div className="container mx-auto px-4 md:px-6 py-12">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                        {/* Brand */}
                        <div className="space-y-3">
                            <div className="flex items-center gap-1.5">
                                <BetixLogo className="h-7 w-auto" />
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                {t(locale, "footerTagline")}
                            </p>
                            <div className="flex items-center gap-3 pt-1">
                                <FootballIcon size={16} className="text-muted-foreground" />
                                <BasketballIcon size={16} className="text-muted-foreground" />
                                <TennisIcon size={16} className="text-muted-foreground" />
                            </div>
                        </div>

                        {/* Produit */}
                        <div className="space-y-3">
                            <h4 className="text-sm font-semibold">{t(locale, "product")}</h4>
                            <ul className="space-y-2">
                                <li><Link href={`/${locale}#features`} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t(locale, "navFeatures")}</Link></li>
                                <li><Link href={`/${locale}/pricing`} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t(locale, "navPricing")}</Link></li>
                                <li><Link href={`/${locale}#faq`} className="text-sm text-muted-foreground hover:text-foreground transition-colors">FAQ</Link></li>
                            </ul>
                        </div>

                        {/* L&eacute;gal */}
                        <div className="space-y-3">
                            <h4 className="text-sm font-semibold">{t(locale, "legal")}</h4>
                            <ul className="space-y-2">
                                <li><Link href={`/${locale}/cgu`} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t(locale, "terms")}</Link></li>
                                <li><Link href={`/${locale}/privacy`} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t(locale, "privacy")}</Link></li>
                            </ul>
                        </div>

                        {/* Contact */}
                        <div className="space-y-3">
                            <h4 className="text-sm font-semibold">{t(locale, "contact")}</h4>
                            <ul className="space-y-2">
                                <li><a href="mailto:marcel@bet-ix.com" className="text-sm text-muted-foreground hover:text-foreground transition-colors">marcel@bet-ix.com</a></li>
                            </ul>
                        </div>
                    </div>

                    {/* Bottom bar */}
                    <div className="mt-10 pt-6 border-t border-border/50 flex flex-col sm:flex-row justify-between items-center gap-3">
                        <p className="text-xs text-muted-foreground">
                            &copy; 2026 BETIX. {t(locale, "rights")}
                        </p>
                        <p className="text-xs text-muted-foreground text-center">
                            {t(locale, "responsibleGaming")}
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
