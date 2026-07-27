export interface AdminKPI {
    id?: string;
    label: string;
    value: string;
    rawValue?: number;
    change: number;
    trend: "up" | "down" | "stable" | "neutral";
    icon?: string;
    sparklineData?: number[];
    unit?: string;
}

export interface RevenueData {
    month: string;
    revenue: number;
    predictions: number;
    newSubs: number;
}

export interface ActivityLog {
    id: string;
    timestamp: string;
    type: "user" | "payment" | "system" | "security" | "alert";
    message: string;
    details?: string;
    status: "success" | "warning" | "error" | "info";
}

export interface SystemService {
    name: string;
    status: "operational" | "degraded" | "down" | "maintenance";
    uptime: number;
    latency: number;
    load: number;
    lastCheck?: string;
}

export interface SystemNotification {
    id: string;
    type: "system" | "user";
    severity: "info" | "warning" | "critical";
    title: string;
    message: string;
    timestamp: string;
    read: boolean;
    action?: string;
}

export interface SubscriptionPlan {
    id: string;
    name: string;
    price: number;
    interval: "month" | "year";
    features: string[] | { text: string; included: boolean }[];
    isPopular: boolean;
    isActive: boolean;
    subscriberCount: number;
    promoPrice?: number;
    promo?: {
        price: number;
        savings: string;
        duration: string;
    } | null;
}

export interface AdminUser {
    id: string;
    name: string;
    username?: string;
    email: string;
    role: string;
    plan_id?: string;
    avatar?: string;
    avatar_url?: string;
    joinDate: string;
    lastActive: string;
    totalPredictions: number;
    win_rate?: number;
    favoriteSport: string;
    status: string;
    admin_notes?: string | null;
}

export type AdminUserSortField = "created_at" | "username" | "last_active" | "total_predictions" | "win_rate" | "status";
export type SortDirection = "asc" | "desc";

export interface AdminUserFilters {
    search: string;
    role: string | null;
    status: string | null;
    plan: string | null;
    sortBy: AdminUserSortField;
    sortDir: SortDirection;
    page: number;
    pageSize: number;
}
