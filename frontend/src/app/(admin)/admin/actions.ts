'use server';

import { supabaseAdmin } from "@/lib/supabase-admin";
import { getServerLocale } from "@/lib/i18n-server";
import { AdminKPI, RevenueData, ActivityLog, SystemService } from "@/types/admin";

const PAID_PLAN_EXCLUDE = new Set(["free", "no_subscription"]);
const ACTIVE_STATUSES = new Set(["active", "trialing"]);
const DATE_LOCALE: Record<string, string> = { fr: "fr-FR", en: "en-US", es: "es-ES", de: "de-DE" };

function monthlyEquivalent(price: number, frequency: string | null | undefined): number {
    switch (frequency) {
        case "yearly": return price / 12;
        case "weekly": return price * 4.345;
        case "daily": return price * 30.44;
        default: return price; // monthly
    }
}

function monthKey(dateStr: string): string {
    return dateStr.slice(0, 7); // "2026-07"
}

function last6MonthKeys(): string[] {
    const keys: string[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return keys;
}

export async function getAdminOverviewAction(): Promise<{
    success: boolean;
    kpis?: AdminKPI[];
    revenue?: RevenueData[];
    activity?: ActivityLog[];
    services?: SystemService[];
    error?: string;
}> {
    const startedAt = Date.now();
    try {
        const locale = await getServerLocale();
        const dateLocale = DATE_LOCALE[locale] || "en-US";
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
        sixMonthsAgo.setDate(1);
        const sixMonthsAgoISO = sixMonthsAgo.toISOString();

        const [
            usersCountRes,
            plansRes,
            subsRes,
            recentSubsRes,
            recentProfilesRes,
            predictionsCountRes,
            recentPredictionsRes,
            logsRes,
        ] = await Promise.all([
            supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
            supabaseAdmin.from("plans").select("id, price, frequency"),
            supabaseAdmin.from("subscriptions").select("user_id, plan_id, status"),
            supabaseAdmin.from("subscriptions").select("plan_id, status, created_at").gte("created_at", sixMonthsAgoISO),
            supabaseAdmin.from("profiles").select("id, created_at").gte("created_at", sixMonthsAgoISO),
            supabaseAdmin.from("ai_match_audits").select("id", { count: "exact", head: true }),
            supabaseAdmin.from("ai_match_audits").select("id, created_at").gte("created_at", sixMonthsAgoISO),
            supabaseAdmin.from("system_logs").select("*").order("created_at", { ascending: false }).limit(20),
        ]);

        if (usersCountRes.error) throw usersCountRes.error;
        if (plansRes.error) throw plansRes.error;
        if (subsRes.error) throw subsRes.error;
        if (predictionsCountRes.error) throw predictionsCountRes.error;
        if (logsRes.error) throw logsRes.error;

        const planPriceMap = new Map<string, { price: number; frequency: string | null }>();
        for (const p of plansRes.data || []) {
            planPriceMap.set(p.id, { price: Number(p.price) || 0, frequency: p.frequency });
        }

        const isPaidActiveSub = (s: { plan_id: string; status: string }) =>
            ACTIVE_STATUSES.has(s.status) && !PAID_PLAN_EXCLUDE.has(s.plan_id);

        const paidSubs = (subsRes.data || []).filter(isPaidActiveSub);
        const mrr = paidSubs.reduce((sum, s) => {
            const plan = planPriceMap.get(s.plan_id);
            if (!plan) return sum;
            return sum + monthlyEquivalent(plan.price, plan.frequency);
        }, 0);

        // ---- KPIs ----
        const totalUsers = usersCountRes.count ?? 0;
        const totalPredictions = predictionsCountRes.count ?? 0;

        const months = last6MonthKeys();
        const newUsersByMonth = new Map<string, number>();
        for (const p of recentProfilesRes.data || []) {
            const k = monthKey(p.created_at);
            newUsersByMonth.set(k, (newUsersByMonth.get(k) || 0) + 1);
        }
        const newSubsByMonth = new Map<string, number>();
        const revenueByMonth = new Map<string, number>();
        for (const s of recentSubsRes.data || []) {
            if (!isPaidActiveSub(s)) continue;
            const k = monthKey(s.created_at);
            newSubsByMonth.set(k, (newSubsByMonth.get(k) || 0) + 1);
            const plan = planPriceMap.get(s.plan_id);
            if (plan) {
                revenueByMonth.set(k, (revenueByMonth.get(k) || 0) + monthlyEquivalent(plan.price, plan.frequency));
            }
        }
        const predictionsByMonth = new Map<string, number>();
        for (const a of recentPredictionsRes.data || []) {
            const k = monthKey(a.created_at);
            predictionsByMonth.set(k, (predictionsByMonth.get(k) || 0) + 1);
        }

        const userSparkline = months.map((m) => newUsersByMonth.get(m) || 0);
        const predSparkline = months.map((m) => predictionsByMonth.get(m) || 0);
        const subsSparkline = months.map((m) => newSubsByMonth.get(m) || 0);
        const revenueSparkline = months.map((m) => Math.round(revenueByMonth.get(m) || 0));

        const pctChange = (series: number[]) => {
            const prev = series[series.length - 2] || 0;
            const curr = series[series.length - 1] || 0;
            if (prev === 0) return curr > 0 ? 100 : 0;
            return Math.round(((curr - prev) / prev) * 100);
        };

        const kpis: AdminKPI[] = [
            { id: "users", label: "", value: String(totalUsers), change: pctChange(userSparkline), trend: pctChange(userSparkline) >= 0 ? "up" : "down", icon: "users", sparklineData: userSparkline },
            { id: "subs", label: "", value: String(paidSubs.length), change: pctChange(subsSparkline), trend: pctChange(subsSparkline) >= 0 ? "up" : "down", icon: "subs", sparklineData: subsSparkline },
            { id: "mrr", label: "MRR", value: `${Math.round(mrr)}€`, change: pctChange(revenueSparkline), trend: pctChange(revenueSparkline) >= 0 ? "up" : "down", icon: "mrr", sparklineData: revenueSparkline },
            { id: "preds", label: "", value: String(totalPredictions), change: pctChange(predSparkline), trend: pctChange(predSparkline) >= 0 ? "up" : "down", icon: "preds", sparklineData: predSparkline },
        ];

        // ---- Revenue chart (last 6 months) ----
        const revenue: RevenueData[] = months.map((m) => {
            const [year, month] = m.split("-").map(Number);
            const label = new Date(year, month - 1, 1).toLocaleDateString(dateLocale, { month: "short" });
            return {
                month: label,
                revenue: Math.round(revenueByMonth.get(m) || 0),
                predictions: predictionsByMonth.get(m) || 0,
                newSubs: newSubsByMonth.get(m) || 0,
            };
        });

        // ---- Live activity (derived from system_logs) ----
        type SystemLogRow = { id: number; created_at: string; level: string; source: string; message: string };
        const activity: ActivityLog[] = ((logsRes.data || []) as SystemLogRow[]).map((l) => ({
            id: String(l.id),
            timestamp: new Date(l.created_at).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" }),
            type: l.source?.includes("stripe") ? "payment" : "system",
            message: `[${l.source}] ${l.message}`,
            status: l.level === "critical" || l.level === "error" ? "error" : l.level === "warning" ? "warning" : "info",
        }));

        // ---- System health ----
        const dbLatency = Date.now() - startedAt;
        const services: SystemService[] = [
            { name: "Database", status: "operational", uptime: 100, latency: dbLatency, load: 0 },
        ];

        const backendBase = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api").replace(/\/api\/?$/, "");
        try {
            const apiStart = Date.now();
            const res = await fetch(`${backendBase}/api/health`, { signal: AbortSignal.timeout(3000), cache: "no-store" });
            services.push({
                name: "API",
                status: res.ok ? "operational" : "degraded",
                uptime: res.ok ? 100 : 0,
                latency: Date.now() - apiStart,
                load: 0,
            });
        } catch {
            services.push({ name: "API", status: "down", uptime: 0, latency: 0, load: 0 });
        }

        return { success: true, kpis, revenue, activity, services };
    } catch (error: any) {
        console.error("[Admin Overview Action] Error:", error);
        return { success: false, error: error.message };
    }
}
