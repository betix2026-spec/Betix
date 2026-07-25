"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { HolographicGrid } from "@/components/admin/users/HolographicGrid";
import { MissionDossier } from "@/components/admin/users/MissionDossier";
import { EditAgentModal } from "@/components/admin/users/EditAgentModal";
import { CreateAgentModal } from "@/components/admin/users/CreateAgentModal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Download, Search, UserPlus, Filter, Loader2 } from "lucide-react";

import { AdminUser } from "@/types/admin";
import { cancelSubscriptionAction } from "@/app/(admin)/admin/users/actions";
import { useI18n } from "@/lib/use-i18n";

export default function AdminUsersPage() {
    const { copy, locale } = useI18n();
    const [search, setSearch] = useState("");
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedUser, setSelectedUser] = useState<any | null>(null);
    const [editingUser, setEditingUser] = useState<any | null>(null);
    const [isDossierOpen, setIsDossierOpen] = useState(false);
    const [isEditOpen, setIsEditOpen] = useState(false);
    const [isCreateOpen, setIsCreateOpen] = useState(false);

    const supabase = createClient();

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data, error: rpcError } = await supabase.rpc('get_admin_users_v1');

            if (rpcError) {
                console.error("RPC Error Details:", rpcError);
                throw new Error(rpcError.message || "Failed to fetch users via RPC");
            }

            // Map DB names to UI names if necessary
            const mappedUsers = (data || []).map((u: any) => ({
                ...u,
                name: u.username || copy("Utilisateur inconnu"),
                avatar: u.avatar_url,
                joinDate: u.created_at ? new Date(u.created_at).toLocaleDateString(locale) : "N/A",
                lastActive: u.last_active ? new Date(u.last_active).toLocaleString(locale) : copy("Jamais"),
                totalPredictions: u.total_predictions || 0,
                favoriteSport: u.favorite_sport || "N/A",
            }));

            setUsers(mappedUsers as AdminUser[]);
        } catch (err: any) {
            console.error("Error fetching admin users:", err);
            setError(err.message || copy("Une erreur inconnue est survenue."));
        } finally {
            setLoading(false);
        }
    }, [copy, locale, supabase]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const filtered = users.filter(
        (u) =>
            u.username?.toLowerCase().includes(search.toLowerCase()) ||
            u.email?.toLowerCase().includes(search.toLowerCase())
    );

    const handleUserSelect = (user: any) => {
        setSelectedUser(user);
        setIsDossierOpen(true);
    };

    const handleEditUser = (user: any) => {
        setEditingUser(user);
        setIsEditOpen(true);
    };

    const handleCancelSubscription = (user: AdminUser) => {
        // Open the dossier on the user so the cancel UI is visible
        setSelectedUser(user);
        setIsDossierOpen(true);
    };

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
                    <Button variant="outline" size="sm" className="bg-black border-white/10 hover:bg-white/5 text-neutral-400 gap-2 font-mono text-xs h-9">
                        <Download className="size-3.5" /> {copy("Exporter")}
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
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="w-[1px] h-6 bg-white/10" />
                <Button variant="ghost" size="sm" className="text-neutral-400 hover:text-white gap-2 font-mono text-xs">
                    <Filter className="size-3.5" /> {copy("Filtres")}
                </Button>
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
                        users={filtered}
                        onSelectUser={handleUserSelect}
                        onEditUser={handleEditUser}
                        onCancelSubscription={handleCancelSubscription}
                    />

                    {/* Side Panel */}
                    <MissionDossier
                        user={selectedUser}
                        open={isDossierOpen}
                        onClose={() => setIsDossierOpen(false)}
                        onSubscriptionCancelled={fetchUsers}
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
