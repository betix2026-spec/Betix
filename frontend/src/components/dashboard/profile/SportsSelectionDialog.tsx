"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Check, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/AuthProvider";
import { FootballIcon, BasketballIcon, TennisIcon } from "@/components/icons/SportIcons";
import { useI18n } from "@/lib/use-i18n";

interface SportsSelectionDialogProps {
    currentFavorites: string[];
    userId: string;
    trigger: React.ReactNode;
}

const AVAILABLE_SPORTS = [
    { id: "football", label: "Football", icon: FootballIcon, color: "text-emerald-500", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
    { id: "basketball", label: "Basketball", icon: BasketballIcon, color: "text-orange-500", bg: "bg-orange-500/10", border: "border-orange-500/20" },
    { id: "tennis", label: "Tennis", icon: TennisIcon, color: "text-amber-500", bg: "bg-amber-500/10", border: "border-amber-500/20" },
];

export function SportsSelectionDialog({ currentFavorites, userId, trigger }: SportsSelectionDialogProps) {
    const { copy } = useI18n();
    const [open, setOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [selected, setSelected] = useState<string[]>(currentFavorites || []);

    const supabase = createClient();
    const router = useRouter();
    const { refreshProfile } = useAuth();

    // Sync state when open or props change
    useEffect(() => {
        if (open) {
            setSelected(currentFavorites || []);
        }
    }, [open, currentFavorites]);

    const toggleSport = (id: string) => {
        if (selected.includes(id)) {
            setSelected(selected.filter(s => s !== id));
        } else {
            setSelected([...selected, id]);
        }
    };

    const handleSave = async () => {
        setIsLoading(true);
        try {
            const { error } = await supabase
                .from("profiles")
                .update({ favorite_sports: selected })
                .eq("id", userId);

            if (error) throw error;

            toast.success(copy("Sports favoris mis à jour !"));
            await refreshProfile();
            setOpen(false);
            router.refresh();
        } catch (error) {
            console.error(error);
            toast.error(copy("Erreur lors de la mise à jour."));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger}
            </DialogTrigger>
            <DialogContent className="bg-neutral-950/95 border-white/10 backdrop-blur-xl text-white sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold tracking-tight">{copy("Vos Sports Favoris")}</DialogTitle>
                </DialogHeader>

                <div className="grid grid-cols-1 gap-3 py-4">
                    {AVAILABLE_SPORTS.map((sport) => {
                        const isSelected = selected.includes(sport.id);
                        const Icon = sport.icon;
                        return (
                            <div
                                key={sport.id}
                                onClick={() => toggleSport(sport.id)}
                                className={cn(
                                    "flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all duration-200",
                                    isSelected
                                        ? `${sport.bg} ${sport.border}`
                                        : "bg-white/5 border-white/5 hover:bg-white/10"
                                )}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={cn("size-10 rounded-full flex items-center justify-center bg-black/40", sport.color)}>
                                        <Icon size={20} />
                                    </div>
                                    <span className={cn("font-bold tracking-wide", isSelected ? "text-white" : "text-neutral-400")}>
                                        {sport.label}
                                    </span>
                                </div>
                                {isSelected && (
                                    <div className={cn("size-6 rounded-full flex items-center justify-center", sport.bg)}>
                                        <Check className={cn("size-4", sport.color)} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="flex justify-end gap-3">
                    <Button variant="ghost" onClick={() => setOpen(false)} className="hover:bg-white/5">
                        {copy("Annuler")}
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={isLoading}
                        className="bg-blue-600 hover:bg-blue-700 font-bold"
                    >
                        {isLoading && <Loader2 className="size-4 mr-2 animate-spin" />}
                        {!isLoading && <Save className="size-4 mr-2" />}
                        {copy("Enregistrer")}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
