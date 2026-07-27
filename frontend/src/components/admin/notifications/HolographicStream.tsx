"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AppNotification } from "@/types/notifications";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    AlertCircle,
    MessageSquare,
    Terminal,
    Check,
    Clock,
    ArrowRight,
    Reply,
    Send
} from "lucide-react";
import { useI18n } from "@/lib/use-i18n";
import { adminSendNotificationAction } from "@/app/actions/notifications";

interface HolographicStreamProps {
    notifications: AppNotification[];
    onMarkRead: (id: string) => void;
}

export function HolographicStream({ notifications, onMarkRead }: HolographicStreamProps) {
    const { copy, t } = useI18n();
    const [openReplyId, setOpenReplyId] = useState<string | null>(null);
    const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
    const [sendingId, setSendingId] = useState<string | null>(null);

    const handleSendReply = async (notif: AppNotification) => {
        const draft = (replyDrafts[notif.id] || "").trim();
        if (!draft || !notif.sender_id) return;

        setSendingId(notif.id);
        try {
            const result = await adminSendNotificationAction({
                title: `${t("notifReplyTitlePrefix")}: ${notif.title}`,
                message: draft,
                targetUserId: notif.sender_id,
                severity: "info",
            });
            if (!result.success) throw new Error(result.error);

            toast.success(t("notifReplySentToast"));
            setReplyDrafts((current) => ({ ...current, [notif.id]: "" }));
            setOpenReplyId(null);
            if (!notif.is_read) onMarkRead(notif.id);
        } catch {
            toast.error(t("notifReplyErrorToast"));
        } finally {
            setSendingId(null);
        }
    };

    if (notifications.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 bg-black/40 rounded-3xl border border-white/5 backdrop-blur-sm">
                <div className="size-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                    <Check className="size-8 text-neutral-500" />
                </div>
                <h3 className="text-lg font-bold text-white mb-1">{t("notifAllClearTitle")}</h3>
                <p className="text-sm font-mono text-neutral-500">{t("notifNoneDescription")}</p>
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
                                        <AvatarFallback className="bg-blue-500/10 text-blue-400 font-bold rounded-lg uppercase">
                                            {notif.sender?.username ? notif.sender.username.slice(0, 2) : <MessageSquare className="size-5" />}
                                        </AvatarFallback>
                                    </Avatar>
                                )}
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center justify-between gap-y-1 mb-1">
                                    <div className="flex items-center gap-2">
                                        {isCritical && (
                                            <Badge variant="destructive" className="animate-pulse bg-red-500/20 text-red-500 border-red-500/50 uppercase tracking-wider text-[9px] h-5">
                                                {t("notifCriticalBadge")}
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

                                {!isSystem && notif.sender?.username && (
                                    <Link
                                        href={`/admin/users?userId=${notif.sender_id}`}
                                        className="inline-flex items-center gap-1.5 text-xs font-mono text-blue-400 hover:text-blue-300 hover:underline mb-1.5"
                                    >
                                        {t("notifFromLabel")} @{notif.sender.username}
                                        {notif.sender.email && (
                                            <span className="text-neutral-500">({notif.sender.email})</span>
                                        )}
                                    </Link>
                                )}

                                <p className="text-sm text-neutral-400 font-medium leading-relaxed mb-3">
                                    {notif.message}
                                </p>

                                <div className="flex items-center gap-3">
                                    {notif.action_url && (
                                        <Button
                                            asChild
                                            size="sm"
                                            variant="outline"
                                            className={cn(
                                                "h-7 text-xs font-mono font-bold uppercase gap-1",
                                                isCritical ? "bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20" :
                                                    "bg-white/5 border-white/10 text-white hover:bg-white/10"
                                            )}
                                        >
                                            <Link href={notif.action_url}>
                                                {copy("Voir les détails")} <ArrowRight className="size-3" />
                                            </Link>
                                        </Button>
                                    )}
                                    {!isSystem && notif.sender_id && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setOpenReplyId(openReplyId === notif.id ? null : notif.id)}
                                            className="h-7 text-xs font-mono font-bold uppercase gap-1 bg-white/5 border-white/10 text-white hover:bg-white/10"
                                        >
                                            <Reply className="size-3" /> {t("notifReplyButton")}
                                        </Button>
                                    )}
                                    {!notif.is_read && (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => onMarkRead(notif.id)}
                                            className="h-7 text-[10px] text-neutral-500 hover:text-white uppercase tracking-wider"
                                        >
                                            {t("notifAcknowledgeButton")}
                                        </Button>
                                    )}
                                </div>

                                {openReplyId === notif.id && (
                                    <div className="mt-3 space-y-2">
                                        <Textarea
                                            value={replyDrafts[notif.id] || ""}
                                            onChange={(e) => setReplyDrafts((current) => ({ ...current, [notif.id]: e.target.value }))}
                                            placeholder={t("notifReplyPlaceholder")}
                                            className="min-h-20 bg-black/60 border-white/10 text-sm text-white"
                                        />
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => setOpenReplyId(null)}
                                                className="h-7 text-[10px] text-neutral-500 hover:text-white uppercase tracking-wider"
                                            >
                                                {t("notifReplyCancelButton")}
                                            </Button>
                                            <Button
                                                size="sm"
                                                onClick={() => handleSendReply(notif)}
                                                disabled={sendingId === notif.id || !(replyDrafts[notif.id] || "").trim()}
                                                className="h-7 text-[10px] font-bold uppercase gap-1 bg-blue-600 hover:bg-blue-500 text-white"
                                            >
                                                <Send className="size-3" /> {t("notifReplySendButton")}
                                            </Button>
                                        </div>
                                    </div>
                                )}
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
