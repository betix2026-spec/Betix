"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/use-i18n";

interface DeleteAccountDialogProps {
    trigger: React.ReactNode;
}

export function DeleteAccountDialog({ trigger }: DeleteAccountDialogProps) {
    const { copy, locale } = useI18n();
    const [open, setOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [confirmationText, setConfirmationText] = useState("");

    const supabase = createClient();

    const handleDelete = async () => {
        if (confirmationText !== "DELETE") return;

        setIsLoading(true);
        try {
            // Soft delete via profiles (users can usually update their own profile)
            // Ideally this updates a 'deleted_at' column or calls an RPC. 
            // For now we'll simulate a soft delete request as per available columns.
            const { error } = await supabase
                .from("profiles")
                .update({ deleted_at: new Date().toISOString() })
                .eq("id", (await supabase.auth.getUser()).data.user?.id);

            if (error) throw error;

            toast.error(copy("Compte marqué pour suppression."));

            // Log out
            await supabase.auth.signOut();
            window.location.replace(`/${locale}/login`);

        } catch (error) {
            console.error(error);
            toast.error(copy("Erreur critique lors de la suppression."));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger}
            </DialogTrigger>
            <DialogContent className="bg-neutral-950/95 border-red-500/20 backdrop-blur-xl text-white sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold tracking-tight text-red-500 flex items-center gap-2">
                        <AlertTriangle className="size-5" />
                        {copy("Zone de Danger")}
                    </DialogTitle>
                    <DialogDescription className="text-neutral-400">
                        {copy("Cette action est irréversible. Toutes vos données seront perdues.")}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-200 text-sm">
                        {copy("Tapez DELETE ci-dessous pour confirmer la suppression définitive de votre compte.")}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="confirm" className="sr-only">{copy("Confirmation")}</Label>
                        <Input
                            id="confirm"
                            value={confirmationText}
                            onChange={(e) => setConfirmationText(e.target.value)}
                            placeholder="DELETE"
                            className="bg-white/5 border-white/10 text-white focus:border-red-500/50 focus:ring-red-500/20 placeholder:text-neutral-600 font-mono tracking-wider"
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-3">
                    <Button variant="ghost" onClick={() => setOpen(false)} className="hover:bg-white/5">
                        {copy("Annuler")}
                    </Button>
                    <Button
                        onClick={handleDelete}
                        disabled={isLoading || confirmationText !== "DELETE"}
                        className="bg-red-600 hover:bg-red-700 font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading && <Loader2 className="size-4 mr-2 animate-spin" />}
                        {!isLoading && <Trash2 className="size-4 mr-2" />}
                        {copy("Supprimer mon compte")}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
