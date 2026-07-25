"use client";

import { AdminUser } from "@/types/admin";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    MoreVertical,
    User,
    Edit,
    Crown,
    Ban,
    Trash2,
    Search,
    Shield,
    Eye
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { useI18n } from "@/lib/use-i18n";

interface HolographicGridProps {
    users: AdminUser[];
    onSelectUser: (user: AdminUser) => void;
    onEditUser: (user: AdminUser) => void;
    onCancelSubscription?: (user: AdminUser) => void;
}

export function HolographicGrid({ users, onSelectUser, onEditUser, onCancelSubscription }: HolographicGridProps) {
    const { copy } = useI18n();
    const roleConfig: Record<string, any> = {
        free: { color: "text-neutral-400", border: "border-neutral-700", bg: "bg-neutral-500/10", label: "ROOKIE" },
        premium: { color: "text-amber-400", border: "border-amber-500/50", bg: "bg-amber-500/10", label: "PREMIUM" },
        premium_monthly: { color: "text-amber-400", border: "border-amber-500/50", bg: "bg-amber-500/10", label: "PREMIUM" },
        premium_annual: { color: "text-amber-400", border: "border-amber-500/50", bg: "bg-amber-500/10", label: "PREMIUM" },
        admin: { color: "text-blue-400", border: "border-blue-500/50", bg: "bg-blue-500/10", label: "ADMIN" },
        super_admin: { color: "text-purple-400", border: "border-purple-500/50", bg: "bg-purple-500/10", label: "SUPER ADMIN" },
    };

    const statusConfig: Record<string, any> = {
        active: { color: "bg-emerald-500", glow: "shadow-[0_0_10px_#10b981]" },
        past_due: { color: "bg-red-500", glow: "shadow-[0_0_10px_#ef4444]" },
        canceled: { color: "bg-neutral-500", glow: "" },
        suspended: { color: "bg-red-500", glow: "shadow-[0_0_10px_#ef4444]" },
        churned: { color: "bg-neutral-500", glow: "" },
        inactive: { color: "bg-neutral-700", glow: "" },
    };

    return (
        <div className="rounded-3xl border border-white/10 bg-black/40 backdrop-blur-xl overflow-hidden shadow-2xl">
            {/* Header / Legend */}
            <div className="grid grid-cols-12 gap-4 px-6 py-3 border-b border-white/5 bg-white/[0.02] text-[10px] uppercase font-bold tracking-widest text-neutral-500">
                <div className="col-span-4 sm:col-span-3">{copy("Agent Identity")}</div>
                <div className="col-span-2 hidden sm:block">{copy("Classification")}</div>
                <div className="col-span-2 hidden md:block">{copy("Status")}</div>
                <div className="col-span-2 hidden lg:block">{copy("Specialization")}</div>
                <div className="col-span-2 hidden xl:block text-right">{copy("Intel (Preds)")}</div>
                <div className="col-span-1 text-right">{copy("Actions")}</div>
            </div>

            {/* Grid Body */}
            <div className="divide-y divide-white/5">
                {users.map((user) => {
                    // Decide classification based on role or plan_id
                    const classificationKey = (user.role === 'admin' || user.role === 'super_admin')
                        ? user.role
                        : (user.plan_id || 'free');
                    const role = roleConfig[classificationKey] || roleConfig.free;
                    const status = statusConfig[user.status] || statusConfig.inactive;

                    return (
                        <div
                            key={user.id}
                            onClick={() => onSelectUser(user)}
                            className="group relative grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-white/[0.03] transition-colors cursor-pointer"
                        >
                            {/* Hover Scanline Effect */}
                            <div className="absolute inset-0 border-y border-transparent group-hover:border-blue-500/30 pointer-events-none transition-colors" />
                            <div className="absolute inset-y-0 left-0 w-[2px] bg-transparent group-hover:bg-blue-500 shadow-[0_0_15px_#3b82f6] transition-colors" />

                            {/* Identity */}
                            <div className="col-span-4 sm:col-span-3 flex items-center gap-4 relative z-10">
                                <div className="relative">
                                    <Avatar className="size-10 rounded-lg border border-white/10 group-hover:border-blue-500/50 transition-colors">
                                        {user.avatar && (
                                            <img
                                                src={user.avatar}
                                                alt={user.name}
                                                className="size-full object-cover rounded-lg"
                                            />
                                        )}
                                        <AvatarFallback className="bg-white/5 text-xs font-bold text-neutral-300 rounded-lg">
                                            {user.name.slice(0, 2).toUpperCase()}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className={cn("absolute -bottom-1 -right-1 size-2.5 rounded-full border-2 border-black", status.color, status.glow)} />
                                </div>
                                <div className="overflow-hidden">
                                    <p className="text-sm font-bold text-white truncate group-hover:text-blue-400 transition-colors">{user.name}</p>
                                    <p className="text-[10px] text-neutral-500 font-mono truncate">{user.email}</p>
                                </div>
                            </div>

                            {/* Classification (Role) */}
                            <div className="col-span-2 hidden sm:block relative z-10">
                                <Badge variant="outline" className={cn("text-[9px] h-5 px-2 rounded-md font-mono tracking-wider", role.bg, role.color, role.border)}>
                                    {role.label}
                                </Badge>
                            </div>

                            {/* Status */}
                            <div className="col-span-2 hidden md:block relative z-10">
                                <div className="flex items-center gap-2">
                                    <div className={cn("h-1 w-8 rounded-full bg-white/10 overflow-hidden")}>
                                        <div className={cn("h-full w-full", status.color)} />
                                    </div>
                                    <span className="text-[10px] font-bold uppercase text-neutral-400">{user.status}</span>
                                </div>
                            </div>

                            {/* Specialization (Sport) */}
                            <div className="col-span-2 hidden lg:block relative z-10">
                                <span className="text-xs font-medium text-neutral-400 flex items-center gap-2">
                                    {user.favoriteSport}
                                </span>
                            </div>

                            {/* Intel (Stats) */}
                            <div className="col-span-2 hidden xl:block text-right relative z-10">
                                <span className="text-sm font-bold font-mono text-white">{user.totalPredictions}</span>
                                <span className="text-[10px] text-neutral-600 ml-1">{copy("OPS")}</span>
                            </div>

                            {/* Actions (Floating on Hover) */}
                            <div className="col-span-8 sm:col-span-1 flex justify-end relative z-20">
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 mr-2 absolute right-8 top-1/2 -translate-y-1/2 bg-black/80 backdrop-blur-md rounded-lg p-1 border border-white/10">
                                    <Button size="icon-xs" variant="ghost" className="h-7 w-7 hover:text-blue-400 hover:bg-blue-400/10"><Eye className="size-3.5" /></Button>
                                    <Button
                                        size="icon-xs"
                                        variant="ghost"
                                        className="h-7 w-7 hover:text-amber-400 hover:bg-amber-400/10"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onEditUser(user);
                                        }}
                                    >
                                        <Edit className="size-3.5" />
                                    </Button>
                                    <div className="w-[1px] h-4 bg-white/10 mx-1" />
                                    <Button size="icon-xs" variant="ghost" className="h-7 w-7 hover:text-red-500 hover:bg-red-500/10"><Ban className="size-3.5" /></Button>
                                </div>

                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="icon-xs" className="h-8 w-8 text-neutral-500 hover:text-white">
                                            <MoreVertical className="size-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-48 bg-black/90 border-white/10 backdrop-blur-xl">
                                        <DropdownMenuItem className="gap-2 text-xs font-medium"><User className="size-3.5" /> {copy("Voir le dossier")}</DropdownMenuItem>
                                        <DropdownMenuItem
                                            className="gap-2 text-xs font-medium"
                                            onSelect={(e) => {
                                                e.preventDefault();
                                                onEditUser(user);
                                            }}
                                        >
                                            <Edit className="size-3.5" /> {copy("Modifier les accès")}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="gap-2 text-xs font-medium"><Crown className="size-3.5 text-amber-500" /> {copy("Offrir Premium")}</DropdownMenuItem>
                                        {(user.status === 'active' || user.status === 'past_due' || user.status === 'trialing') && (
                                            <DropdownMenuItem
                                                className="text-orange-400 focus:text-orange-400 gap-2 text-xs font-medium"
                                                onSelect={(e) => {
                                                    e.preventDefault();
                                                    onCancelSubscription?.(user);
                                                }}
                                            >
                                                <Ban className="size-3.5" /> {copy("Annuler l'abonnement")}
                                            </DropdownMenuItem>
                                        )}
                                        <DropdownMenuSeparator className="bg-white/10" />
                                        <DropdownMenuItem className="text-red-400 focus:text-red-400 gap-2 text-xs font-medium">
                                            <Ban className="size-3.5" /> {copy("Suspendre l'agent")}
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>

                        </div>
                    );
                })}
            </div>
        </div>
    );
}
