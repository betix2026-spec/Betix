"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
    Bell,
    Menu,
} from "lucide-react";
import { UserNav } from "@/components/auth/UserNav";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { useI18n } from "@/lib/use-i18n";

export function AdminHeader({ onMenuClick }: { onMenuClick?: () => void }) {
    const { copy } = useI18n();
    const pathname = usePathname();
    const pathParts = pathname.split("/").filter(Boolean);

    return (
        <header className="h-14 border-b border-border bg-background/50 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-40">
            <div className="flex items-center gap-4">
                {onMenuClick && (
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        className="lg:hidden"
                        onClick={onMenuClick}
                    >
                        <Menu className="size-5" />
                    </Button>
                )}

                <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">{copy("Admin")}</span>
                    {pathParts.slice(1).map((part) => (
                        <div key={part} className="flex items-center gap-2">
                            <span className="text-muted-foreground opacity-30">/</span>
                            <span className="font-medium capitalize">{part}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="flex items-center gap-4">
                <NotificationBell />

                <Separator orientation="vertical" className="h-6 mx-1" />

                <UserNav />
            </div>
        </header>
    );
}
