"use client";

import { useEffect, useState, useCallback } from "react";
import { AppNotification } from "@/types/notifications";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { Button } from "@/components/ui/button";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Bell, Check, Info, AlertTriangle, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { de, enUS, es, fr } from "date-fns/locale";
import Link from "next/link";
import { markNotificationAsReadAction } from "@/app/actions/notifications";
import { useI18n } from "@/lib/use-i18n";
import { pickLocalized } from "@/lib/i18n";

export function NotificationBell() {
    const { copy, locale } = useI18n();
    const { profile, isLoading } = useAuth();
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isOpen, setIsOpen] = useState(false);
    const supabase = createClient();

    const fetchNotifications = useCallback(async () => {
        if (!profile) return;
        try {
            // Fetch notifications where user_id is the user OR user_id is null (broadcast) and not for admin
            // Admin panel handles its own notifications
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .or(`user_id.eq.${profile.id},and(user_id.is.null,is_for_admin.eq.false)`)
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) throw error;

            setNotifications(data as AppNotification[]);
            setUnreadCount(data.filter((n) => !n.is_read).length);
        } catch (error) {
            console.error("Error fetching notifications:", error);
        }
    }, [profile, supabase]);

    useEffect(() => {
        if (!isLoading && profile) {
            fetchNotifications();

            // Setup Realtime subscription
            const channel = supabase
                .channel('schema-db-changes')
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'notifications',
                        filter: `user_id=eq.${profile.id}`,
                    },
                    () => {
                        fetchNotifications();
                    }
                )
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'notifications',
                        filter: `user_id=is.null`,
                    },
                    () => {
                        fetchNotifications();
                    }
                )
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        }
    }, [profile, isLoading, fetchNotifications, supabase]);

    const handleMarkAsRead = async (id: string) => {
        // Optimistic update
        setNotifications((prev) =>
            prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));

        await markNotificationAsReadAction(id);
    };

    if (isLoading || !profile) return null;

    const dateLocale = { fr, en: enUS, es, de }[locale];

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative size-9 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-all">
                    <Bell className="size-4" />
                    {unreadCount > 0 && (
                        <span className="absolute top-0 right-0 size-2.5 bg-red-500 rounded-full border border-black animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.7)]" />
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[340px] p-0 bg-neutral-950/95 border-white/10 backdrop-blur-xl rounded-2xl overflow-hidden shadow-2xl">
                <div className="flex items-center justify-between p-4 border-b border-white/5 bg-white/5">
                    <div className="flex items-center gap-2">
                        <Bell className="size-4 text-neutral-400" />
                        <span className="text-sm font-bold text-white tracking-wide">{copy("Notifications")}</span>
                        {unreadCount > 0 && (
                            <span className="text-[10px] bg-red-500/10 text-red-500 font-bold px-2 py-0.5 rounded-full border border-red-500/20">
                                {unreadCount} {copy("new")}
                            </span>
                        )}
                    </div>
                </div>

                <div className="max-h-[350px] overflow-y-auto w-full flex flex-col no-scrollbar">
                    {notifications.length === 0 ? (
                        <div className="p-8 text-center text-sm text-neutral-500 flex flex-col items-center gap-3">
                            <Bell className="size-8 text-white/5" />
                            <p>{copy("Aucune notification pour le moment.")}</p>
                        </div>
                    ) : (
                        notifications.map((notification) => {
                            let Icon = Info;
                            let color = "text-blue-400";
                            let bg = "bg-blue-400/10";

                            const displayTitle = pickLocalized(locale, notification.title, {
                                en: notification.title_en,
                                es: notification.title_es,
                                de: notification.title_de,
                            });
                            const displayMessage = pickLocalized(locale, notification.message, {
                                en: notification.message_en,
                                es: notification.message_es,
                                de: notification.message_de,
                            });

                            if (notification.severity === 'warning') {
                                Icon = AlertTriangle;
                                color = "text-amber-400";
                                bg = "bg-amber-400/10";
                            } else if (notification.severity === 'critical') {
                                Icon = ShieldAlert;
                                color = "text-red-400";
                                bg = "bg-red-400/10";
                            }

                            return (
                                <div
                                    key={notification.id}
                                    className={cn(
                                        "flex gap-3 p-4 border-b border-white/[0.03] transition-colors relative group",
                                        !notification.is_read ? "bg-white/[0.02]" : "hover:bg-white/[0.02]"
                                    )}
                                >
                                    <div className={cn("size-8 rounded-full flex items-center justify-center shrink-0", bg, color)}>
                                        <Icon className="size-4" />
                                    </div>
                                    <div className="flex-1 min-w-0 space-y-1">
                                        <div className="flex justify-between items-start gap-2">
                                            <p className={cn("text-xs font-bold truncate", !notification.is_read ? "text-white" : "text-neutral-300")}>
                                                {displayTitle}
                                            </p>
                                            <span className="text-[9px] text-neutral-500 font-mono shrink-0 pt-0.5">
                                                {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true, locale: dateLocale })}
                                            </span>
                                        </div>
                                        <p className="text-xs text-neutral-400 line-clamp-2 leading-relaxed">
                                            {displayMessage}
                                        </p>

                                        {notification.action_url && (
                                            <Link href={notification.action_url} className="inline-block mt-2">
                                                <Button variant="outline" size="sm" className="h-6 text-[10px] px-3 font-bold border-white/10 hover:bg-white/10">
                                                    {copy("Voir les détails")}
                                                </Button>
                                            </Link>
                                        )}
                                    </div>

                                    {!notification.is_read && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="absolute right-2 top-2 size-6 opacity-0 group-hover:opacity-100 transition-opacity text-neutral-500 hover:text-white"
                                            onClick={() => handleMarkAsRead(notification.id)}
                                            title={copy("Marquer comme lu")}
                                        >
                                            <Check className="size-3" />
                                        </Button>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
