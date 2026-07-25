"use client";

import Link from "next/link";
import { useAuth } from "@/components/auth/AuthProvider";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { LogOut, Shield, User } from "lucide-react";
import { useI18n } from "@/lib/use-i18n";

export function UserNav() {
    const { t, locale } = useI18n();
    const { profile, isAdmin, signOut } = useAuth();

    const initials = profile?.username
        ? profile.username.slice(0, 2).toUpperCase()
        : "??";

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative size-9 sm:size-10 rounded-full p-0 border border-white/10 bg-white/5 hover:bg-white/10 transition-all overflow-hidden group">
                    <Avatar className="size-full">
                        {profile?.avatar_url && (
                            <img
                                src={profile.avatar_url}
                                alt={profile.username}
                                className="size-full object-cover group-hover:scale-110 transition-transform duration-500"
                            />
                        )}
                        <AvatarFallback className="bg-transparent text-xs font-black group-hover:scale-110 transition-transform">
                            {initials}
                        </AvatarFallback>
                    </Avatar>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 bg-neutral-950/95 border-white/10 backdrop-blur-xl p-2">
                <div className="flex items-center gap-3 p-2">
                    <Avatar className="size-10 border border-white/10">
                        {profile?.avatar_url && (
                            <img
                                src={profile.avatar_url}
                                alt={profile.username}
                                className="size-full object-cover"
                            />
                        )}
                        <AvatarFallback className="bg-blue-600 text-white font-black text-xs">
                            {initials}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col min-w-0">
                        <span className="text-sm font-bold text-white truncate">
                            {profile?.username || t("loading")}
                        </span>
                        <div className="flex items-center gap-1 mt-0.5">
                            <Badge variant="outline" className="text-[9px] h-4 px-1 border-white/10 bg-white/5 text-neutral-400 uppercase font-black">
                                {profile?.role || "USER"}
                            </Badge>
                            {isAdmin && (
                                <Badge className="text-[9px] h-4 px-1 bg-blue-600 text-white border-none uppercase font-black">
                                    ADMIN
                                </Badge>
                            )}
                        </div>
                    </div>
                </div>

                <DropdownMenuSeparator className="bg-white/5 my-2" />

                <div className="px-1 py-1">
                    <LanguageSwitcher />
                </div>

                <DropdownMenuSeparator className="bg-white/5 my-2" />

                {!isAdmin && (
                    <Link href={`/${locale}/profile`}>
                        <DropdownMenuItem className="gap-2 cursor-pointer py-2.5">
                            <User className="size-4 text-neutral-400" />
                            <span className="font-medium">{t("profile")}</span>
                        </DropdownMenuItem>
                    </Link>
                )}

                {isAdmin && (
                    <Link href={`/${locale}/admin`}>
                        <DropdownMenuItem className="gap-2 cursor-pointer py-2.5 text-blue-400 font-bold bg-blue-400/5 focus:bg-blue-400/10 focus:text-blue-300">
                            <Shield className="size-4" />
                            <span>{t("admin")}</span>
                        </DropdownMenuItem>
                    </Link>
                )}



                <DropdownMenuItem
                    className="text-destructive gap-2 cursor-pointer py-2.5 focus:bg-destructive/10 focus:text-destructive"
                    onSelect={() => signOut()}
                >
                    <LogOut className="size-4" />
                    <span className="font-bold">{t("signOut")}</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
