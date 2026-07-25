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
 * 4. Admin marks a notification as read
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
 * 5. Admin sends a broadcast or targeted message
 */
export async function adminSendNotificationAction(data: {
    title: string;
    message: string;
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
