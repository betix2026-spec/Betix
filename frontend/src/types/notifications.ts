export type NotificationType = 'system' | 'cancellation_request' | 'support_message' | 'broadcast';
export type NotificationSeverity = 'info' | 'warning' | 'critical';

export interface AppNotification {
    id: string;
    user_id: string | null;
    is_for_admin: boolean;
    sender_id: string | null;
    type: NotificationType;
    title: string;
    message: string;
    title_en?: string | null;
    title_es?: string | null;
    title_de?: string | null;
    message_en?: string | null;
    message_es?: string | null;
    message_de?: string | null;
    severity: NotificationSeverity;
    is_read: boolean;
    action_url: string | null;
    created_at: string;

    // Relation (returned when joined with profiles via sender_id)
    sender?: {
        username: string;
        avatar_url: string | null;
    } | null;
}
