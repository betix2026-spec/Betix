"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { BetixLogo } from "@/components/ui/betix-logo";
import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { LogOut, Shield, User, Loader2, Menu } from "lucide-react";
import { FootballIcon, BasketballIcon, TennisIcon, AllSportsIcon } from "@/components/icons/SportIcons";
import { Suspense, useState, useEffect } from "react";
import { UserNav } from "@/components/auth/UserNav";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { SubscriptionWall } from "@/components/dashboard/SubscriptionWall";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger
} from "@/components/ui/sheet";
import { useI18n } from "@/lib/use-i18n";

function DashboardNavbar() {
    const { t, locale } = useI18n();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const currentSport = searchParams.get("sport") || "all";
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const sports = [
        { id: "all", label: t("allSports"), icon: <AllSportsIcon size={18} /> },
        { id: "football", label: "Football", icon: <FootballIcon size={18} /> },
        { id: "basketball", label: "Basketball", icon: <BasketballIcon size={18} /> },
        { id: "tennis", label: "Tennis", icon: <TennisIcon size={18} /> },
    ];

    return (
        <nav className="sticky top-0 z-50 w-full border-b border-white/5 bg-black/80 backdrop-blur-xl">
            <div className="container mx-auto px-4 md:px-6 h-14 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 sm:gap-6 min-w-0">
                    <Link href={`/${locale}/dashboard`} className="flex items-center gap-2 shrink-0">
                        <BetixLogo className="scale-90 sm:scale-100" />
                    </Link>

                    {/* Sports Nav - Now visible on mobile (icons only) */}
                    <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-1">
                        {sports.map((sport) => {
                            const isActive = currentSport === sport.id;
                            return (
                                <Link
                                    key={sport.id}
                                    href={`/${locale}/dashboard?sport=${sport.id}`}
                                    className={cn(
                                        "h-9 px-3 sm:px-4 rounded-full flex items-center gap-2 text-sm font-bold transition-all duration-300 shrink-0",
                                        isActive
                                            ? "bg-white/10 text-white shadow-[0_0_20px_rgba(255,255,255,0.05)]"
                                            : "text-neutral-500 hover:text-white hover:bg-white/5"
                                    )}
                                    title={sport.label}
                                >
                                    {sport.icon}
                                    <span className="hidden sm:inline">{sport.label}</span>
                                </Link>
                            );
                        })}
                    </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-4">

                    <NotificationBell />

                    <UserNav />

                    {/* Mobile Sports Toggle */}
                    <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                        <SheetTrigger asChild>
                            <Button variant="ghost" size="icon" className="lg:hidden text-white hover:bg-white/5">
                                <Menu className="size-5" />
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="right" className="w-[280px] bg-neutral-950 border-white/10">
                            <SheetHeader className="text-left mb-6">
                                <SheetTitle className="text-white flex items-center gap-2">
                                    <BetixLogo />
                                </SheetTitle>
                            </SheetHeader>
                            <div className="flex flex-col gap-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-neutral-500 px-2 mb-2">{t("chooseSport")}</span>
                                {sports.map((sport) => {
                                    const isActive = currentSport === sport.id;
                                    return (
                                        <Link
                                            key={sport.id}
                                            href={`/${locale}/dashboard?sport=${sport.id}`}
                                            onClick={() => setMobileMenuOpen(false)}
                                            className={cn(
                                                "w-full h-12 px-4 rounded-xl flex items-center gap-3 text-sm font-bold transition-all duration-300",
                                                isActive
                                                    ? "bg-blue-600 text-white"
                                                    : "text-neutral-400 hover:text-white hover:bg-white/5"
                                            )}
                                        >
                                            {sport.icon}
                                            {sport.label}
                                        </Link>
                                    );
                                })}
                            </div>
                        </SheetContent>
                    </Sheet>
                </div>
            </div>
        </nav>
    );
}

export default function DashboardLayoutClient({
    children,
}: {
    children: React.ReactNode;
}) {
    const { isLoading, profile, subscription, isAdmin, assuranceLevel } = useAuth();
    const { t } = useI18n();
    const router = useRouter();
    const pathname = usePathname();

    // =========================================================================
    // MFA GUARD
    // =========================================================================
    useEffect(() => {
        if (isLoading) return;

        // If user has a factor enrolled but is only at AAL1, force MFA verification
        // Skip if already on /mfa page
        const isMfaPage = pathname === "/mfa";

        if (assuranceLevel?.current === 'aal1' && assuranceLevel?.next === 'aal2' && !isMfaPage) {
            console.log("[DashboardGuard] MFA required (aal1 -> aal2). Redirecting to /mfa...");
            router.push("/mfa");
        }
    }, [isLoading, assuranceLevel, pathname, router]);

    // =========================================================================
    // PAYWALL — Inline overlay instead of redirect
    // =========================================================================
    const needsSubscription = (() => {
        if (isLoading) return false;
        if (isAdmin) return false;
        const isExcludedPath =
            pathname === "/dashboard/profile" ||
            pathname.startsWith("/onboarding");
        if (isExcludedPath) return false;
        const hasActiveStatus = subscription &&
            ["active", "trialing", "past_due"].includes(subscription.status);
        const isRestrictedPlan = subscription?.plan?.id === 'no_subscription';
        return !hasActiveStatus || isRestrictedPlan;
    })();

    return (
        <div className="min-h-screen flex flex-col bg-black">
            {/* Full Screen Hydration Guard */}
            {isLoading && !profile && (
                <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black gap-4 text-white">
                    <Loader2 className="size-10 animate-spin text-blue-500" />
                    <span className="text-sm font-black uppercase tracking-widest text-neutral-500">{t("loadingUniverse")}</span>
                </div>
            )}

            <Suspense fallback={<div className="h-14 bg-black border-b border-white/5" />}>
                <DashboardNavbar />
                {isLoading && (
                    <div className="absolute top-14 left-0 w-full h-[1px] bg-blue-600/50 overflow-hidden z-[51]">
                        <div className="h-full bg-blue-400 animate-pulse" style={{ width: '40%' }} />
                    </div>
                )}
            </Suspense>

            <main className="flex-1 container mx-auto px-4 md:px-6 py-6">
                <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
                    {needsSubscription ? <SubscriptionWall /> : children}
                </Suspense>
            </main>
        </div>
    );
}
