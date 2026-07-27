'use server';

import { supabaseAdmin } from "@/lib/supabase-admin";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { copy } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";

// ============================================================================
// USER ACTIONS
// ============================================================================

/**
 * 1. User requests to cancel their subscription
 */
export async function sendCancellationRequestAction(options?: { reason?: string }) {
    console.log("[Notification Action] User requested cancellation");
    try {
        const locale = await getServerLocale();
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return { success: false, error: copy(locale, "Non autorisé.") };
        }

        const title = copy(locale, "Cancellation request");
        const message = options?.reason
            ? `${title}. ${copy(locale, "Reason provided")}: "${options.reason}"`
            : `${title} (${copy(locale, "No reason provided")}).`;

        const { error } = await supabaseAdmin
            .from('notifications')
            .insert({
                sender_id: user.id,
                user_id: null, // Admin is recipient
                is_for_admin: true,
                type: 'cancellation_request',
                title,
                message: message,
                severity: 'critical'
            });

        if (error) throw error;

        revalidatePath('/profile/subscription');
        return { success: true };
    } catch (error: any) {
        console.error("[Notification Action] Error:", error);
        return { success: false, error: error.message };
    }
}

/**
 * 2. User sends a support message to the admin
 */
export async function sendSupportMessageAction(title: string, message: string) {
    console.log("[Notification Action] User sending support message");
    try {
        const locale = await getServerLocale();
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return { success: false, error: copy(locale, "Non autorisé.") };
        }

        if (!title.trim() || !message.trim()) {
            return { success: false, error: copy(locale, "Le titre et le message sont obligatoires.") };
        }

        const { error } = await supabaseAdmin
            .from('notifications')
            .insert({
                sender_id: user.id,
                user_id: null, // Admin is recipient
                is_for_admin: true,
                type: 'support_message',
                title: title,
                message: message,
                severity: 'warning' // Default for support to catch attention
            });

        if (error) throw error;

        revalidatePath('/dashboard/profile');
        return { success: true };
    } catch (error: any) {
        console.error("[Notification Action] Error:", error);
        return { success: false, error: error.message };
    }
}

/**
 * 3. User marks their notification as read
 */
export async function markNotificationAsReadAction(notificationId: string) {
    console.log("[Notification Action] User marking notification as read:", notificationId);
    try {
        const locale = await getServerLocale();
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return { success: false, error: copy(locale, "Non autorisé.") };
        }

        // The RLS policy we created ensures the user can only update their own notifications
        const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', notificationId)
            // Ensure they own it (redundant with RLS, but safe)
            .eq('user_id', user.id);

        if (error) throw error;

        revalidatePath('/'); // Revalidate everywhere the bell might be
        return { success: true };
    } catch (error: any) {
        console.error("[Notification Action] Error:", error);
        return { success: false, error: error.message };
    }
}

// ============================================================================
// ADMIN ACTIONS
// ============================================================================

/**
 * 4. Admin fetches their inbox (messages/requests sent to admin), with the
 * sender's email attached. Email lives in auth.users, not public.profiles,
 * so it can't come from the client-side embedded select the page used before —
 * this runs with the service role and looks it up per distinct sender.
 */
export async function getAdminNotificationsAction() {
    try {
        const { data, error } = await supabaseAdmin
            .from('notifications')
            .select('*, sender:profiles!sender_id(username, avatar_url)')
            .eq('is_for_admin', true)
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        const senderIds = Array.from(new Set((data || []).map((n: any) => n.sender_id).filter(Boolean)));
        const emailBySenderId = new Map<string, string>();
        await Promise.all(senderIds.map(async (id: string) => {
            const { data: userData } = await supabaseAdmin.auth.admin.getUserById(id);
            if (userData?.user?.email) emailBySenderId.set(id, userData.user.email);
        }));

        const enriched = (data || []).map((n: any) => ({
            ...n,
            sender: n.sender ? { ...n.sender, email: n.sender_id ? emailBySenderId.get(n.sender_id) : undefined } : null,
        }));

        return { success: true, data: enriched };
    } catch (error: any) {
        console.error("[Notification Action] getAdminNotifications Error:", error);
        return { success: false, error: error.message };
    }
}

/**
 * 5. Admin marks a notification as read
 */
export async function adminMarkNotificationAsReadAction(notificationId: string | 'all') {
    console.log(`[Notification Action] Admin marking notification(s) as read: ${notificationId}`);
    try {
        let query = supabaseAdmin
            .from('notifications')
            .update({ is_read: true })
            .eq('is_for_admin', true);

        if (notificationId !== 'all') {
            query = query.eq('id', notificationId);
        }

        const { error } = await query;
        if (error) throw error;

        revalidatePath('/admin/notifications');
        return { success: true };
    } catch (error: any) {
        console.error("[Notification Action] Error:", error);
        return { success: false, error: error.message };
    }
}

/**
 * 6. Admin sends a broadcast or targeted message
 */
export async function adminSendNotificationAction(data: {
    title: string;
    message: string;
    title_en?: string | null;
    title_es?: string | null;
    title_de?: string | null;
    message_en?: string | null;
    message_es?: string | null;
    message_de?: string | null;
    targetUserId?: string | null; // null = broadcast to everyone
    severity?: 'info' | 'warning' | 'critical';
    actionUrl?: string;
}) {
    console.log("[Notification Action] Admin sending notification", data);
    try {
        const { error } = await supabaseAdmin
            .from('notifications')
            .insert({
                sender_id: null, // System/Admin
                user_id: data.targetUserId || null,
                is_for_admin: false,
                type: data.targetUserId ? 'system' : 'broadcast',
                title: data.title,
                message: data.message,
                title_en: data.title_en || null,
                title_es: data.title_es || null,
                title_de: data.title_de || null,
                message_en: data.message_en || null,
                message_es: data.message_es || null,
                message_de: data.message_de || null,
                severity: data.severity || 'info',
                action_url: data.actionUrl || null
            });

        if (error) throw error;

        revalidatePath('/admin/notifications');
        return { success: true };
    } catch (error: any) {
        console.error("[Notification Action] Error:", error);
        return { success: false, error: error.message };
    }
}

/**
 * 7. Admin generates AI-drafted en/es/de translations for a French title/message,
 * to review and edit before sending (does not persist anything).
 */
export async function translateNotificationDraftAction(title: string, message: string) {
    try {
        const backendBase = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api").replace(/\/api\/?$/, "");
        // NOTE: the backend's system router is double-prefixed (registered at /api/system
        // AND declares its own /system prefix internally), so the real path has "system" twice.
        const res = await fetch(`${backendBase}/api/system/system/translate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ texts: { title, message } }),
            signal: AbortSignal.timeout(20000),
        });

        if (!res.ok) {
            const detail = await res.text().catch(() => "");
            throw new Error(`Translation service error (${res.status}): ${detail}`);
        }

        const data = await res.json();
        const translations = data.translations || {};

        return {
            success: true,
            title: translations.title || {},
            message: translations.message || {},
        };
    } catch (error: any) {
        console.error("[Notification Action] Translation Error:", error);
        return { success: false, error: error.message };
    }
}
