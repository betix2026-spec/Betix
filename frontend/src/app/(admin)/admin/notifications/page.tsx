"use client";

import { useEffect, useState, useCallback } from "react";
import { SystemNotification } from "@/types/admin";
import { SignalProcessor } from "@/components/admin/notifications/SignalProcessor";
import { HolographicStream } from "@/components/admin/notifications/HolographicStream";
import { CommsConfig } from "@/components/admin/notifications/CommsConfig";
import { Button } from "@/components/ui/button";
import { Check, Settings, Shield, Radio } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { adminMarkNotificationAsReadAction } from "@/app/actions/notifications";
import { toast } from "sonner";
import { AppNotification } from "@/types/notifications";
import { useI18n } from "@/lib/use-i18n";

export default function AdminNotificationsPage() {
    const { copy } = useI18n();
    const [filter, setFilter] = useState<"all" | "system" | "user" | "critical">("all");
    const [isConfigOpen, setIsConfigOpen] = useState(false);
    // Use AppNotification instead of the fake SystemNotification
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const supabase = createClient();

    const fetchAdminNotifications = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('is_for_admin', true)
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;
            setNotifications(data as AppNotification[]);
        } catch (error) {
            console.error("Error fetching admin comms:", error);
        }
    }, [supabase]);

    useEffect(() => {
        fetchAdminNotifications();

        // Setup Realtime subscription for incoming admin comms
        const channel = supabase
            .channel('admin-comms-changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'notifications',
                    filter: `is_for_admin=eq.true`,
                },
                () => {
                    fetchAdminNotifications();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchAdminNotifications, supabase]);

    // Calculate counts for badges based on AppNotification mapping
    // We map severity to the filter tabs: 'critical' is critical, 'user' is where sender_id is not null?
    // Actually the tabs were based on type previously. Let's adapt to AppNotification fields.
    const counts = {
        all: notifications.filter(n => !n.is_read).length,
        system: notifications.filter(n => (n.type === "system" || n.type === "broadcast") && !n.is_read).length,
        user: notifications.filter(n => (n.type === "cancellation_request" || n.type === "support_message") && !n.is_read).length,
        critical: notifications.filter(n => n.severity === "critical" && !n.is_read).length
    };

    const filtered = notifications.filter(n => {
        if (filter === "all") return true;
        if (filter === "critical") return n.severity === "critical";
        if (filter === "system") return n.type === "system" || n.type === "broadcast";
        if (filter === "user") return n.type === "cancellation_request" || n.type === "support_message";
        return true;
    });

    const handleMarkRead = async (id: string | "all") => {
        // Optimistic Update
        if (id === "all") {
            setNotifications(current => current.map(n => ({ ...n, is_read: true })));
        } else {
            setNotifications(current => current.map(n =>
                n.id === id ? { ...n, is_read: true } : n
            ));
        }

        try {
            const result = await adminMarkNotificationAsReadAction(id);
            if (!result.success) {
                toast.error(copy("Erreur de synchronisation."));
                fetchAdminNotifications(); // Revert
            }
        } catch (error) {
            toast.error(copy("Erreur réseau."));
            fetchAdminNotifications();
        }
    };

    return (
        <div className="space-y-8 animate-fade-in pb-12 max-w-5xl mx-auto">

            {/* Command Header */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/10 pb-6">
                <div>
                    <h1 className="text-4xl font-black uppercase tracking-tight text-white mb-2">{copy("Notifications admin")}</h1>
                    <p className="text-sm font-mono text-neutral-500 flex items-center gap-2">
                        <Radio className="size-3.5 animate-pulse text-emerald-500" />
                        {copy("Connecté en temps réel")}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Button
                        onClick={() => handleMarkRead("all")}
                        variant="outline"
                        size="sm"
                        className="border-white/10 text-neutral-400 hover:text-white hover:bg-white/5 font-mono text-xs gap-2"
                    >
                        <Check className="size-3.5" /> {copy("Tout marquer comme lu")}
                    </Button>
                    <Button
                        onClick={() => setIsConfigOpen(true)}
                        size="sm"
                        className="bg-neutral-800 hover:bg-neutral-700 text-white font-bold tracking-wide border border-white/10 gap-2"
                    >
                        <Settings className="size-3.5" /> {copy("Réglages")}
                    </Button>
                </div>
            </div>

            {/* Signal Processor (Filter Tabs) */}
            <SignalProcessor
                filter={filter}
                counts={counts}
                onFilterChange={setFilter}
            />

            {/* Holographic Stream (The Feed) */}
            <HolographicStream
                notifications={filtered}
                onMarkRead={handleMarkRead}
            />

            {/* Footer Status */}
            <div className="flex items-center justify-between text-[10px] font-mono text-neutral-600 pt-4 border-t border-white/5">
                <span>{copy("BUFFER_CAPACITY")}: 85%</span>
                <span className="flex items-center gap-2">
                    <Shield className="size-3" /> {copy("SECURE_CONNECTION_TLS_1.3")}
                </span>
            </div>

            {/* Settings Side Panel */}
            <CommsConfig
                open={isConfigOpen}
                onClose={() => setIsConfigOpen(false)}
            />

        </div>
    );
}
