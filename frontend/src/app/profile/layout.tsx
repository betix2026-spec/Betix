import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BetixLogo } from "@/components/ui/betix-logo";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { UserNav } from "@/components/auth/UserNav";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { copy } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ProfileLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // 1. Initialize Server Client
    const supabase = await createClient();
    const locale = await getServerLocale();

    // 2. Check User Session
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect(`/${locale}/login`);
    }

    // 3. Render Profile Shell
    return (
        <div className="min-h-screen bg-black text-white selection:bg-primary/30 selection:text-white">
            {/* Minimalist Profile Navbar */}
            <nav className="sticky top-0 z-50 w-full border-b border-white/5 bg-black/80 backdrop-blur-xl">
                <div className="container mx-auto px-4 md:px-6 h-14 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <Link href={`/${locale}/dashboard`} className="flex items-center gap-2 shrink-0">
                            <BetixLogo className="scale-90 sm:scale-100" />
                        </Link>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                        <Button variant="ghost" className="h-9 px-3 text-neutral-400 hover:text-white hover:bg-white/5" asChild>
                            <Link href={`/${locale}/dashboard`}>
                                <ArrowLeft className="size-4 mr-2" />
                                {copy(locale, "Retour Dashboard")}
                            </Link>
                        </Button>
                        <NotificationBell />
                        <UserNav />
                    </div>
                </div>
            </nav>

            {/* Page Content */}
            <main className="container mx-auto p-4 md:p-6 lg:p-8 animate-fade-in pt-8">
                {children}
            </main>
        </div>
    );
}
