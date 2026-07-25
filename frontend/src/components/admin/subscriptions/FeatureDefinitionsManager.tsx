"use client";

import { useState } from "react";
import { FeatureDefinition } from "@/types/plans";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    createFeatureDefinitionAction,
    updateFeatureDefinitionAction,
    deleteFeatureDefinitionAction,
} from "@/app/(admin)/admin/subscriptions/actions";
import { Plus, Pencil, Trash2, Check, X, Loader2, Database } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/lib/use-i18n";

interface FeatureDefinitionsManagerProps {
    definitions: FeatureDefinition[];
    onUpdate: () => void | Promise<void>;
}

const TYPE_COLORS: Record<string, string> = {
    text: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    boolean: "bg-green-500/10 text-green-400 border-green-500/20",
    number: "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

export function FeatureDefinitionsManager({ definitions, onUpdate }: FeatureDefinitionsManagerProps) {
    const { copy } = useI18n();
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<{ label: string; description: string; type: string }>({
        label: "", description: "", type: "text"
    });

    const [showAddForm, setShowAddForm] = useState(false);
    const [newFeature, setNewFeature] = useState({ id: "", label: "", description: "", type: "text" });

    const [isLoading, setIsLoading] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    // ── Edit ──
    const startEdit = (def: FeatureDefinition) => {
        setEditingId(def.id);
        setEditForm({ label: def.label, description: def.description || "", type: def.type });
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditForm({ label: "", description: "", type: "text" });
    };

    const saveEdit = async () => {
        if (!editingId) return;
        setIsLoading(true);
        const result = await updateFeatureDefinitionAction(editingId, {
            label: editForm.label,
            description: editForm.description,
            type: editForm.type as 'text' | 'boolean' | 'number',
        });
        setIsLoading(false);
        if (result.success) {
            toast.success(copy("Feature mise à jour"));
            cancelEdit();
            onUpdate();
        } else {
            toast.error(result.error || copy("Erreur lors de la mise à jour"));
        }
    };

    // ── Create ──
    const handleCreate = async () => {
        if (!newFeature.id || !newFeature.label) {
            toast.error(copy("ID et Label sont obligatoires"));
            return;
        }
        setIsLoading(true);
        const result = await createFeatureDefinitionAction({
            id: newFeature.id,
            label: newFeature.label,
            description: newFeature.description || undefined,
            type: newFeature.type as 'text' | 'boolean' | 'number',
        });
        setIsLoading(false);
        if (result.success) {
            toast.success(copy("Feature créée"));
            setNewFeature({ id: "", label: "", description: "", type: "text" });
            setShowAddForm(false);
            onUpdate();
        } else {
            toast.error(result.error || copy("Erreur lors de la création"));
        }
    };

    // ── Delete ──
    const handleDelete = async (id: string) => {
        if (deletingId === id) {
            // Second click = confirm
            setIsLoading(true);
            const result = await deleteFeatureDefinitionAction(id);
            setIsLoading(false);
            setDeletingId(null);
            if (result.success) {
                toast.success(copy("Feature supprimée"));
                onUpdate();
            } else {
                toast.error(result.error || copy("Erreur lors de la suppression"));
            }
        } else {
            // First click = arm confirmation
            setDeletingId(id);
            setTimeout(() => setDeletingId(null), 3000); // Auto-cancel after 3s
        }
    };

    return (
        <div className="rounded-2xl border border-white/5 bg-black/40 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
                <div className="flex items-center gap-3">
                    <Database className="size-4 text-neutral-500" />
                    <span className="text-xs font-bold uppercase tracking-widest text-neutral-400">
                        {copy("Fonctionnalités")}
                    </span>
                    <Badge variant="secondary" className="text-[10px] font-mono">
                        {definitions.length}
                    </Badge>
                </div>
                <Button
                    size="sm"
                    onClick={() => setShowAddForm(!showAddForm)}
                    className={cn(
                        "gap-1.5 font-mono text-xs h-8 transition-all",
                        showAddForm
                            ? "bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20"
                            : "bg-amber-500 hover:bg-amber-600 text-black"
                    )}
                >
                    {showAddForm ? <><X className="size-3" /> {copy("ANNULER")}</> : <><Plus className="size-3" /> {copy("NEW_FEATURE")}</>}
                </Button>
            </div>

            {/* Add Form */}
            {showAddForm && (
                <div className="px-5 py-4 border-b border-amber-500/20 bg-amber-500/5 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                        <Input
                            placeholder={copy("feature_id")}
                            value={newFeature.id}
                            onChange={(e) => setNewFeature({ ...newFeature, id: e.target.value })}
                            className="bg-black/50 border-white/10 font-mono text-xs h-9"
                        />
                        <Input
                            placeholder={copy("Label affiché")}
                            value={newFeature.label}
                            onChange={(e) => setNewFeature({ ...newFeature, label: e.target.value })}
                            className="bg-black/50 border-white/10 text-xs h-9"
                        />
                        <Input
                            placeholder={copy("Description (optionnel)")}
                            value={newFeature.description}
                            onChange={(e) => setNewFeature({ ...newFeature, description: e.target.value })}
                            className="bg-black/50 border-white/10 text-xs h-9"
                        />
                        <div className="flex gap-2">
                            <Select value={newFeature.type} onValueChange={(v) => setNewFeature({ ...newFeature, type: v })}>
                                <SelectTrigger className="bg-black/50 border-white/10 text-xs h-9 flex-1">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="text">text</SelectItem>
                                    <SelectItem value="boolean">boolean</SelectItem>
                                    <SelectItem value="number">number</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button
                                size="sm"
                                onClick={handleCreate}
                                disabled={isLoading}
                                className="bg-green-600 hover:bg-green-500 text-white h-9 px-4"
                            >
                                {isLoading ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="border-b border-white/5 text-neutral-600 uppercase tracking-widest">
                            <th className="text-left px-5 py-3 font-bold">{copy("ID")}</th>
                            <th className="text-left px-5 py-3 font-bold">{copy("Label")}</th>
                            <th className="text-left px-5 py-3 font-bold hidden sm:table-cell">{copy("Description")}</th>
                            <th className="text-left px-5 py-3 font-bold">{copy("Type")}</th>
                            <th className="text-right px-5 py-3 font-bold">{copy("Actions")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {definitions.map((def) => (
                            <tr
                                key={def.id}
                                className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                            >
                                {editingId === def.id ? (
                                    // Editing Row
                                    <>
                                        <td className="px-5 py-3 font-mono text-neutral-500">{def.id}</td>
                                        <td className="px-5 py-3">
                                            <Input
                                                value={editForm.label}
                                                onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                                                className="bg-black/50 border-white/10 text-xs h-8 w-full"
                                            />
                                        </td>
                                        <td className="px-5 py-3 hidden sm:table-cell">
                                            <Input
                                                value={editForm.description}
                                                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                                                className="bg-black/50 border-white/10 text-xs h-8 w-full"
                                            />
                                        </td>
                                        <td className="px-5 py-3">
                                            <Select value={editForm.type} onValueChange={(v) => setEditForm({ ...editForm, type: v })}>
                                                <SelectTrigger className="bg-black/50 border-white/10 text-xs h-8">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="text">text</SelectItem>
                                                    <SelectItem value="boolean">boolean</SelectItem>
                                                    <SelectItem value="number">number</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    onClick={saveEdit}
                                                    disabled={isLoading}
                                                    className="size-7 text-green-400 hover:bg-green-500/10"
                                                >
                                                    {isLoading ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                                                </Button>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    onClick={cancelEdit}
                                                    className="size-7 text-neutral-500 hover:bg-white/5"
                                                >
                                                    <X className="size-3" />
                                                </Button>
                                            </div>
                                        </td>
                                    </>
                                ) : (
                                    // Display Row
                                    <>
                                        <td className="px-5 py-3 font-mono text-neutral-400">{def.id}</td>
                                        <td className="px-5 py-3 text-white font-medium">{def.label}</td>
                                        <td className="px-5 py-3 text-neutral-500 hidden sm:table-cell">
                                            {def.description || "—"}
                                        </td>
                                        <td className="px-5 py-3">
                                            <Badge variant="outline" className={cn("text-[10px] font-mono", TYPE_COLORS[def.type])}>
                                                {def.type}
                                            </Badge>
                                        </td>
                                        <td className="px-5 py-3 text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    onClick={() => startEdit(def)}
                                                    className="size-7 text-neutral-500 hover:text-white hover:bg-white/5"
                                                >
                                                    <Pencil className="size-3" />
                                                </Button>
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    onClick={() => handleDelete(def.id)}
                                                    disabled={isLoading}
                                                    className={cn(
                                                        "size-7 transition-all",
                                                        deletingId === def.id
                                                            ? "text-red-400 bg-red-500/10 hover:bg-red-500/20 animate-pulse"
                                                            : "text-neutral-500 hover:text-red-400 hover:bg-red-500/5"
                                                    )}
                                                    title={deletingId === def.id ? copy("Cliquez à nouveau pour confirmer") : copy("Supprimer")}
                                                >
                                                    <Trash2 className="size-3" />
                                                </Button>
                                            </div>
                                        </td>
                                    </>
                                )}
                            </tr>
                        ))}
                        {definitions.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-5 py-8 text-center text-neutral-600 font-mono text-xs">
                                    {copy("Aucune fonctionnalité définie")}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
