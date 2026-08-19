"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { HolographicGrid } from "@/components/admin/users/HolographicGrid";
import { MissionDossier } from "@/components/admin/users/MissionDossier";
import { EditAgentModal } from "@/components/admin/users/EditAgentModal";
import { CreateAgentModal } from "@/components/admin/users/CreateAgentModal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Search, UserPlus, Filter, Loader2, ChevronLeft, ChevronRight, X } from "lucide-react";
import { toast } from "sonner";

import { AdminUser, AdminUserSortField, SortDirection } from "@/types/admin";
import { getAdminUsersAction, getPlansAction } from "@/app/(admin)/admin/users/actions";
import { useI18n } from "@/lib/use-i18n";

const CSV_COLUMNS: { key: keyof AdminUser; header: string }[] = [
    { key: "username", header: "Username" },
    { key: "email", header: "Email" },
    { key: "role", header: "Role" },
    { key: "plan_id", header: "Plan" },
    { key: "status", header: "Status" },
    { key: "totalPredictions", header: "Total Predictions" },
    { key: "win_rate", header: "Win Rate" },
    { key: "favoriteSport", header: "Favorite Sport" },
    { key: "joinDate", header: "Joined" },
    { key: "lastActive", header: "Last Active" },
];

function toCsvField(value: unknown): string {
    const str = value === null || value === undefined ? "" : String(value);
    if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
}

function usersToCsv(rows: AdminUser[]): string {
    const header = CSV_COLUMNS.map((c) => toCsvField(c.header)).join(",");
    const lines = rows.map((row) => CSV_COLUMNS.map((c) => toCsvField(row[c.key])).join(","));
    return [header, ...lines].join("\n");
}

const PAGE_SIZE = 25;

export default function AdminUsersPage() {
    const { copy, t, locale } = useI18n();
    const searchParams = useSearchParams();
    const deepLinkUserId = searchParams.get("userId");

    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    const [role, setRole] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [plan, setPlan] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<AdminUserSortField>("created_at");
    const [sortDir, setSortDir] = useState<SortDirection>("desc");
    const [page, setPage] = useState(1);

    const [users, setUsers] = useState<AdminUser[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [plans, setPlans] = useState<{ id: string; name: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
    const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
    const [isDossierOpen, setIsDossierOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [exporting, setExporting] = useState(false);

    // Debounce free-text search before it hits the server
    useEffect(() => {
        const handle = setTimeout(() => {
            setSearch(searchInput);
            setPage(1);
        }, 400);
        return () => clearTimeout(handle);
    }, [searchInput]);

    useEffect(() => {
        getPlansAction().then((result) => {
            if (result.success && result.data) setPlans(result.data);
        });
    }, []);

    const mapUser = useCallback((u: any): AdminUser => ({
        ...u,
        name: u.username || copy("Utilisateur inconnu"),
        avatar: u.avatar_url,
        joinDate: u.created_at ? new Date(u.created_at).toLocaleDateString(locale) : "N/A",
        lastActive: u.last_active ? new Date(u.last_active).toLocaleString(locale) : copy("Jamais"),
        totalPredictions: u.total_predictions || 0,
        favoriteSport: u.favorite_sport || "N/A",
    }), [copy, locale]);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await getAdminUsersAction({
                search, role, status, plan, sortBy, sortDir, page, pageSize: PAGE_SIZE,
            });

            if (!result.success) throw new Error(result.error || "Failed to fetch users");

            setUsers((result.data || []).map(mapUser));
            setTotalCount(result.totalCount || 0);
        } catch (err: any) {
            console.error("Error fetching admin users:", err);
            setError(err.message || copy("Une erreur inconnue est survenue."));
        } finally {
            setLoading(false);
        }
    }, [search, role, status, plan, sortBy, sortDir, page, mapUser, copy]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    // Deep link support: /admin/users?userId=... opens that user's profile directly
    // (e.g. clicking a sender's name from the admin notifications inbox). This is
    // independent of the paginated/filtered list above — the linked user might not
    // be on the current page at all.
    useEffect(() => {
        if (!deepLinkUserId) return;
        getAdminUsersAction({ userId: deepLinkUserId }).then((result) => {
            if (result.success && result.data && result.data.length > 0) {
                setSelectedUser(mapUser(result.data[0]));
                setIsDossierOpen(true);
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [deepLinkUserId]);

    const handleUserSelect = (user: AdminUser) => {
        setSelectedUser(user);
        setIsDossierOpen(true);
    };

    const handleEditUser = (user: AdminUser) => {
        setEditingUser(user);
        setIsEditOpen(true);
    };

    // Cancel-subscription and suspend both work the same way: open the dossier
    // on this user so the actual confirm step is visible in full context,
    // rather than a silent one-click action from the row.
    const handleCancelSubscription = (user: AdminUser) => {
        setSelectedUser(user);
        setIsDossierOpen(true);
    };

    const handleSuspendUser = (user: AdminUser) => {
        setSelectedUser(user);
        setIsDossierOpen(true);
    };

    const handleSort = (field: AdminUserSortField) => {
        if (sortBy === field) {
            setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
        } else {
            setSortBy(field);
            setSortDir("desc");
        }
        setPage(1);
    };

    // Exports every user matching the current search/filters (not just the
    // current page) as a CSV download. Sort is not applied — the export is a
    // full snapshot, not a display order.
    const handleExport = async () => {
        setExporting(true);
        try {
            const result = await getAdminUsersAction({
                search, role, status, plan,
                page: 1,
                pageSize: Math.max(totalCount, 1),
            });

            if (!result.success) throw new Error(result.error || "Failed to fetch users");

            const rows = (result.data || []).map(mapUser);
            if (rows.length === 0) {
                toast.info(copy("Aucun utilisateur à exporter."));
                return;
            }

            const csv = usersToCsv(rows);
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `betix-users-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            toast.success(copy("{count} utilisateurs exportés.").replace("{count}", String(rows.length)));
        } catch (err: any) {
            console.error("Error exporting users:", err);
            toast.error(copy("Échec de l'export."));
        } finally {
            setExporting(false);
        }
    };

    const activeFilterCount = [role, status, plan].filter(Boolean).length;

    const clearFilters = () => {
        setRole(null);
        setStatus(null);
        setPlan(null);
        setPage(1);
    };

    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    const rangeStart = totalCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
    const rangeEnd = Math.min(page * PAGE_SIZE, totalCount);

    if (loading && users.length === 0) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <Loader2 className="size-8 text-blue-500 animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in pb-12">

            {/* Command Header */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-tight text-white">{copy("Utilisateurs (Admin)")}</h1>
                    <p className="text-sm font-mono text-neutral-500 mt-1">{copy("Gérez les comptes utilisateurs")}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="bg-black border-white/10 hover:bg-white/5 text-neutral-400 gap-2 font-mono text-xs h-9"
                        onClick={handleExport}
                        disabled={exporting}
                    >
                        {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                        {copy("Exporter")}
                    </Button>
                    <Button
                        size="sm"
                        className="bg-white text-black hover:bg-neutral-200 gap-2 font-bold font-mono text-xs h-9"
                        onClick={() => setIsCreateOpen(true)}
                    >
                        <UserPlus className="size-3.5" /> {copy("Ajouter un utilisateur")}
                    </Button>
                </div>
            </div>

            {/* Command Bar (Search & Filters) */}
            <div className="flex items-center gap-4 bg-white/[0.02] border border-white/5 p-2 rounded-xl backdrop-blur-md">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-neutral-500" />
                    <Input
                        placeholder={copy("Rechercher un utilisateur par nom ou e-mail...")}
                        className="pl-9 bg-transparent border-none text-white placeholder:text-neutral-600 focus-visible:ring-0 font-mono text-sm h-10"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                    />
                </div>
                <div className="w-[1px] h-6 bg-white/10" />
                <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
                    <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-neutral-400 hover:text-white gap-2 font-mono text-xs relative">
                            <Filter className="size-3.5" /> {copy("Filtres")}
                            {activeFilterCount > 0 && (
                                <span className="ml-1 size-4 rounded-full bg-blue-500 text-white text-[9px] font-bold flex items-center justify-center">
                                    {activeFilterCount}
                                </span>
                            )}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-72 bg-neutral-950/95 border-white/10 backdrop-blur-xl p-4 space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] uppercase font-bold tracking-widest text-neutral-500">{t("adminFilterRoleLabel")}</label>
                            <Select value={role || "all"} onValueChange={(v) => { setRole(v === "all" ? null : v); setPage(1); }}>
                                <SelectTrigger className="bg-white/5 border-white/10 text-white h-9 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{t("adminFilterAllOption")}</SelectItem>
                                    <SelectItem value="user">{t("adminRoleUser")}</SelectItem>
                                    <SelectItem value="admin">{t("adminRoleAdmin")}</SelectItem>
                                    <SelectItem value="super_admin">{t("adminRoleSuperAdmin")}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] uppercase font-bold tracking-widest text-neutral-500">{t("adminFilterStatusLabel")}</label>
                            <Select value={status || "all"} onValueChange={(v) => { setStatus(v === "all" ? null : v); setPage(1); }}>
                                <SelectTrigger className="bg-white/5 border-white/10 text-white h-9 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{t("adminFilterAllOption")}</SelectItem>
                                    <SelectItem value="active">{copy("Active")}</SelectItem>
                                    <SelectItem value="trialing">{copy("Trialing")}</SelectItem>
                                    <SelectItem value="past_due">{copy("Past Due")}</SelectItem>
                                    <SelectItem value="canceled">{copy("Canceled")}</SelectItem>
                                    <SelectItem value="suspended">{copy("Suspended")}</SelectItem>
                                    <SelectItem value="inactive">{copy("Inactive")}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-[10px] uppercase font-bold tracking-widest text-neutral-500">{t("adminFilterPlanLabel")}</label>
                            <Select value={plan || "all"} onValueChange={(v) => { setPlan(v === "all" ? null : v); setPage(1); }}>
                                <SelectTrigger className="bg-white/5 border-white/10 text-white h-9 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{t("adminFilterAllOption")}</SelectItem>
                                    {plans.map((p) => (
                                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {activeFilterCount > 0 && (
                            <Button variant="ghost" size="sm" onClick={clearFilters} className="w-full h-8 text-xs text-neutral-400 hover:text-white gap-1.5">
                                <X className="size-3" /> {t("adminClearFiltersButton")}
                            </Button>
                        )}
                    </PopoverContent>
                </Popover>
            </div>

            {error ? (
                <div className="p-8 rounded-2xl bg-red-500/10 border border-red-500/20 text-center space-y-4">
                    <p className="text-sm font-mono text-red-400">❌ {copy("ERREUR DE BASE DE DONNÉES")}</p>
                    <p className="text-lg font-bold text-white leading-tight">{error}</p>
                    <p className="text-xs text-neutral-500 max-w-md mx-auto leading-relaxed">
                        {copy("Cela est probablement dû à la fonction RPC manquante. Assurez-vous d'avoir bien exécuté le script SQL dans votre console Supabase.")}
                    </p>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.location.reload()}
                        className="border-white/10 hover:bg-white/5 text-white"
                    >
                        {copy("Réessayer")}
                    </Button>
                </div>
            ) : (
                <>
                    {/* The Grid */}
                    <HolographicGrid
                        users={users}
                        sortBy={sortBy}
                        sortDir={sortDir}
                        onSort={handleSort}
                        onSelectUser={handleUserSelect}
                        onEditUser={handleEditUser}
                        onCancelSubscription={handleCancelSubscription}
                        onSuspendUser={handleSuspendUser}
                    />

                    {/* Pagination */}
                    <div className="flex items-center justify-between px-2">
                        <p className="text-[11px] font-mono text-neutral-500">
                            {rangeStart}–{rangeEnd} {t("adminPaginationOf")} {totalCount}
                        </p>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 border-white/10 text-neutral-400 hover:text-white hover:bg-white/5 gap-1 text-xs"
                                disabled={page <= 1 || loading}
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                            >
                                <ChevronLeft className="size-3.5" /> {t("adminPaginationPrev")}
                            </Button>
                            <span className="text-[11px] font-mono text-neutral-500 px-2">{page} / {totalPages}</span>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-8 border-white/10 text-neutral-400 hover:text-white hover:bg-white/5 gap-1 text-xs"
                                disabled={page >= totalPages || loading}
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            >
                                {t("adminPaginationNext")} <ChevronRight className="size-3.5" />
                            </Button>
                        </div>
                    </div>

                    {/* Side Panel */}
                    <MissionDossier
                        user={selectedUser}
                        open={isDossierOpen}
                        onClose={() => setIsDossierOpen(false)}
                        onUserUpdated={fetchUsers}
                    />

                    {/* Edit Modal */}
                    <EditAgentModal
                        user={editingUser}
                        open={isEditOpen}
                        onClose={() => setIsEditOpen(false)}
                        onSuccess={fetchUsers}
                    />

                    {/* Create Modal */}
                    <CreateAgentModal
                        open={isCreateOpen}
                        onClose={() => setIsCreateOpen(false)}
                        onSuccess={fetchUsers}
                    />
                </>
            )}

        </div>
    );
}
