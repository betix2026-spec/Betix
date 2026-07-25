"use client";

import { AppNotification } from "@/types/notifications";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    AlertTriangle,
    AlertCircle,
    Info,
    MessageSquare,
    Terminal,
    Trash2,
    Check,
    Clock,
    ArrowRight
} from "lucide-react";
import { useI18n } from "@/lib/use-i18n";

interface HolographicStreamProps {
    notifications: AppNotification[];
    onMarkRead: (id: string) => void;
}

export function HolographicStream({ notifications, onMarkRead }: HolographicStreamProps) {
    const { copy } = useI18n();

    if (notifications.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 bg-black/40 rounded-3xl border border-white/5 backdrop-blur-sm">
                <div className="size-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                    <Check className="size-8 text-neutral-500" />
                </div>
                <h3 className="text-lg font-bold text-white mb-1">{copy("ALL_CLEAR")}</h3>
                <p className="text-sm font-mono text-neutral-500">{copy("No incoming transmissions.")}</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {notifications.map((notif, index) => {
                const isSystem = notif.type === "system" || notif.type === "broadcast";
                const isCritical = notif.severity === "critical";

                return (
                    <div
                        key={notif.id}
                        className={cn(
                            "relative group p-6 rounded-2xl overflow-hidden transition-all duration-300 animate-in slide-in-from-right-4",
                            "border backdrop-blur-xl",
                            !notif.is_read ? "bg-black/80" : "bg-black/40 opacity-70 hover:opacity-100",
                            isCritical ? "border-red-500/50 shadow-[0_0_20px_-10px_rgba(239,68,68,0.3)]" :
                                isSystem ? "border-emerald-500/20 hover:border-emerald-500/40" :
                                    "border-blue-500/20 hover:border-blue-500/40"
                        )}
                        style={{ animationDelay: `${index * 100}ms` }}
                    >
                        {/* Type Indicator Bar */}
                        <div className={cn(
                            "absolute left-0 top-0 bottom-0 w-1",
                            isCritical ? "bg-red-500 animate-pulse" :
                                isSystem ? "bg-emerald-500" : "bg-blue-500"
                        )} />

                        <div className="flex items-start gap-4 pl-2">

                            {/* Icon / Avatar */}
                            <div className="shrink-0 mt-1">
                                {isSystem ? (
                                    <div className={cn(
                                        "size-10 rounded-lg flex items-center justify-center border bg-black",
                                        isCritical ? "border-red-500/50 text-red-500" : "border-emerald-500/30 text-emerald-500"
                                    )}>
                                        {isCritical ? <AlertCircle className="size-5" /> : <Terminal className="size-5" />}
                                    </div>
                                ) : (
                                    <Avatar className="size-10 border border-blue-500/30 rounded-lg">
                                        <AvatarFallback className="bg-blue-500/10 text-blue-400 font-bold rounded-lg">
                                            <MessageSquare className="size-5" />
                                        </AvatarFallback>
                                    </Avatar>
                                )}
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center justify-between gap-y-1 mb-1">
                                    <div className="flex items-center gap-2">
                                        {isCritical && (
                                            <Badge variant="destructive" className="animate-pulse bg-red-500/20 text-red-500 border-red-500/50 uppercase tracking-wider text-[9px] h-5">
                                                {copy("CRITICAL_ALERT")}
                                            </Badge>
                                        )}
                                        <h3 className={cn("text-base font-bold truncate", isCritical ? "text-red-400" : "text-white")}>
                                            {notif.title}
                                        </h3>
                                    </div>
                                    <span className="text-[10px] uppercase font-mono text-neutral-500 flex items-center gap-1.5 backdrop-blur-md px-2 py-0.5 rounded bg-white/5">
                                        <Clock className="size-3" />
                                        {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>

                                <p className="text-sm text-neutral-400 font-medium leading-relaxed mb-3">
                                    {notif.message}
                                </p>

                                <div className="flex items-center gap-3">
                                    {notif.action_url && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className={cn(
                                                "h-7 text-xs font-mono font-bold uppercase gap-1",
                                                isCritical ? "bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20" :
                                                    "bg-white/5 border-white/10 text-white hover:bg-white/10"
                                            )}
                                        >
                                            {copy("Voir les détails")} <ArrowRight className="size-3" />
                                        </Button>
                                    )}
                                    {!notif.is_read && (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => onMarkRead(notif.id)}
                                            className="h-7 text-[10px] text-neutral-500 hover:text-white uppercase tracking-wider"
                                        >
                                            {copy("Ack_Receipt")}
                                        </Button>
                                    )}
                                </div>
                            </div>

                        </div>

                        {/* Background Scanline */}
                        <div className="absolute inset-0 pointer-events-none opacity-5 bg-[linear-gradient(to_bottom,transparent_2px,white_2px)] bg-[size:100%_4px]" />
                    </div>
                );
            })}
        </div>
    );
}
