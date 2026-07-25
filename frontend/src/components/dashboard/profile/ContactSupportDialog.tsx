"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Mail, Send } from "lucide-react";
import { sendSupportMessageAction } from "@/app/actions/notifications";
import { useI18n } from "@/lib/use-i18n";

export function ContactSupportDialog({ trigger }: { trigger: React.ReactNode }) {
    const { copy } = useI18n();
    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState("");
    const [message, setMessage] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!title.trim() || !message.trim()) {
            toast.error(copy("Veuillez remplir tous les champs."));
            return;
        }

        setIsLoading(true);
        try {
            const result = await sendSupportMessageAction(title, message);

            if (result.success) {
                toast.success(copy("Votre message a été envoyé à notre équipe."));
                setTitle("");
                setMessage("");
                setOpen(false);
            } else {
                toast.error(result.error || copy("Erreur lors de l'envoi."));
            }
        } catch (error) {
            console.error('[Support] Send Error:', error);
            toast.error(copy("Erreur inattendue. Veuillez réessayer."));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] bg-black/90 border-white/10 backdrop-blur-xl">
                <DialogHeader className="pt-2">
                    <DialogTitle className="text-xl font-black uppercase tracking-tight text-white flex items-center gap-2">
                        <Mail className="size-5 text-blue-500" />
                        {copy("Contacter l'équipe")}
                    </DialogTitle>
                    <DialogDescription className="text-neutral-400">
                        {copy("Si vous avez une question ou rencontrez un problème technique, expliquez-nous la situation ci-dessous.")}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 mt-4">
                    <div className="space-y-2">
                        <label className="text-xs uppercase tracking-widest text-neutral-500 font-bold">{copy("Sujet")}</label>
                        <Input
                            placeholder={copy("De quoi s'agit-il ?")}
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            disabled={isLoading}
                            className="bg-white/5 border-white/10 text-white placeholder:text-neutral-600 h-12"
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs uppercase tracking-widest text-neutral-500 font-bold">{copy("Message")}</label>
                        <Textarea
                            placeholder={copy("Détaillez votre demande ici...")}
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            disabled={isLoading}
                            className="bg-white/5 border-white/10 text-white placeholder:text-neutral-600 min-h-[150px] resize-y"
                            required
                        />
                    </div>

                    <div className="pt-4 flex justify-end">
                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="bg-blue-600 hover:bg-blue-500 text-white font-bold h-12 px-8 w-full sm:w-auto"
                        >
                            {isLoading ? (
                                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                            ) : (
                                <Send className="w-5 h-5 mr-2" />
                            )}
                            {copy("Envoyer le message")}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
