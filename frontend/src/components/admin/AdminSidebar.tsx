"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { BetixLogo } from "@/components/ui/betix-logo";
import { cn } from "@/lib/utils";
import {
    LayoutDashboard,
    Users,
    CreditCard,
    Settings,
    Bell,
    ArrowLeft,
    Terminal,
} from "lucide-react";
import { useI18n } from "@/lib/use-i18n";

export function AdminSidebar({ className }: { className?: string }) {
    const { copy, locale } = useI18n();
    const pathname = usePathname();
    const sidebarLinks = [
        { href: `/${locale}/admin`, label: copy("Dashboard"), icon: LayoutDashboard },
        { href: `/${locale}/admin/users`, label: copy("Utilisateurs"), icon: Users },
        { href: `/${locale}/admin/subscriptions`, label: copy("Abonnements"), icon: CreditCard },
        { href: `/${locale}/admin/settings`, label: copy("Configuration"), icon: Settings },
        { href: `/${locale}/admin/notifications`, label: copy("Notifications"), icon: Bell, badge: 3 },
        { href: `/${locale}/admin/logs`, label: copy("System Logs"), icon: Terminal },
    ];

    return (
        <aside className={cn("w-64 border-r border-border bg-card flex flex-col h-screen sticky top-0", className)}>
            <div className="p-6">
                <Link href={`/${locale}/dashboard`} className="flex items-center gap-2 group">
                    <div className="size-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/40 group-hover:scale-110 transition-transform">
                        <ArrowLeft className="size-5 text-white" />
                    </div>
                    <BetixLogo className="h-6 w-auto" />
                    <Badge variant="outline" className="ml-2 bg-blue-600/10 text-blue-500 border-blue-500/20 text-[10px] font-black uppercase">{copy("Admin")}</Badge>
                </Link>
            </div>

            <nav className="flex-1 px-4 space-y-1">
                {sidebarLinks.map((link) => {
                    const isActive = pathname === link.href;
                    return (
                        <Link
                            key={link.href}
                            href={link.href}
                            className={cn(
                                "flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition-colors group",
                                isActive
                                    ? "bg-primary text-primary-foreground"
                                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                        >
                            <div className="flex items-center gap-3">
                                <link.icon className="size-4" />
                                {link.label}
                            </div>
                            {link.badge && (
                                <span className={cn(
                                    "px-1.5 py-0.5 rounded-full text-[10px] font-bold",
                                    isActive ? "bg-white/20 text-white" : "bg-primary/20 text-primary"
                                )}>
                                    {link.badge}
                                </span>
                            )}
                        </Link>
                    );
                })}
            </nav>

            <div className="p-4 mt-auto border-t border-border">
                <Link
                    href={`/${locale}/dashboard`}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                    <ArrowLeft className="size-4" />
                    {copy("Retour Dashboard")}
                </Link>
            </div>
        </aside>
    );
}
