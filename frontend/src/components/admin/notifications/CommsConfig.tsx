"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioTower, Bell, Mail, Smartphone, Volume2, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { adminSendNotificationAction } from "@/app/actions/notifications";
import { useI18n } from "@/lib/use-i18n";

interface CommsConfigProps {
    open: boolean;
    onClose: () => void;
}

export function CommsConfig({ open, onClose }: CommsConfigProps) {
    const { copy } = useI18n();
    const [isSending, setIsSending] = useState(false);
    const [sendForm, setSendForm] = useState({ title: "", message: "", targetUserId: "" });

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!sendForm.title.trim() || !sendForm.message.trim()) return;

        setIsSending(true);
        try {
            const result = await adminSendNotificationAction({
                title: sendForm.title,
                message: sendForm.message,
                targetUserId: sendForm.targetUserId.trim() || null,
                severity: 'info'
            });

            if (result.success) {
                toast.success(copy("Signal transmis avec succès."));
                setSendForm({ title: "", message: "", targetUserId: "" });
            } else {
                toast.error(result.error || copy("Échec de transmission."));
            }
        } catch (error) {
            toast.error(copy("Erreur système."));
        } finally {
            setIsSending(false);
        }
    };

    return (
        <Sheet open={open} onOpenChange={onClose}>
            <SheetContent className="w-full sm:max-w-md border-l border-white/10 bg-black/95 backdrop-blur-xl p-0 shadow-2xl">
                <SheetHeader className="sr-only">
                    <SheetTitle>{copy("Comms Configuration")}</SheetTitle>
                    <SheetDescription>{copy("Paramètres de réception des alertes")}</SheetDescription>
                </SheetHeader>

                {/* Header */}
                <div className="h-20 bg-neutral-900/50 relative overflow-hidden border-b border-white/10 flex items-center px-6">
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:20px_20px] opacity-20" />
                    <div className="flex items-center gap-3 relative z-10">
                        <div className="size-10 rounded-lg bg-neutral-800 flex items-center justify-center border border-white/10">
                            <RadioTower className="size-5 text-white animate-pulse" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-white uppercase tracking-widest">{copy("Comms Config")}</h2>
                            <p className="text-[10px] font-mono text-neutral-500">{copy("SIGNAL_ROUTING_PROTOCOLS")}</p>
                        </div>
                    </div>
                </div>

                <div className="p-6 space-y-8">

                    {/* Channel Settings */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold text-neutral-500 uppercase flex items-center gap-2">
                            <Bell className="size-3.5" /> {copy("Notification Channels")}
                        </h3>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between group">
                                <div className="flex items-center gap-3">
                                    <div className="size-8 rounded bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover:bg-blue-500/20 transition-colors">
                                        <Mail className="size-4" />
                                    </div>
                                    <div>
                                        <Label className="text-sm font-bold text-white">{copy("Email Uplink")}</Label>
                                        <p className="text-[10px] text-neutral-500">{copy("Critical alerts only")}</p>
                                    </div>
                                </div>
                                <Switch defaultChecked />
                            </div>

                            <div className="flex items-center justify-between group">
                                <div className="flex items-center gap-3">
                                    <div className="size-8 rounded bg-emerald-500/10 flex items-center justify-center text-emerald-400 group-hover:bg-emerald-500/20 transition-colors">
                                        <Smartphone className="size-4" />
                                    </div>
                                    <div>
                                        <Label className="text-sm font-bold text-white">{copy("Push Notifications")}</Label>
                                        <p className="text-[10px] text-neutral-500">{copy("Real-time signal feed")}</p>
                                    </div>
                                </div>
                                <Switch defaultChecked />
                            </div>
                        </div>
                    </div>

                    <Separator className="bg-white/10" />

                    {/* Alert Thresholds */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold text-neutral-500 uppercase flex items-center gap-2">
                            <Volume2 className="size-3.5" /> {copy("Signal Intensity")}
                        </h3>
                        <div className="p-3 rounded-lg border border-white/10 bg-white/5 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-mono text-neutral-400">{copy("INFO_LEVEL_LOGS")}</span>
                                <Switch />
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-mono text-neutral-400">{copy("WARNING_LEVEL_LOGS")}</span>
                                <Switch defaultChecked />
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-mono text-red-400 font-bold">{copy("CRITICAL_ALERTS")}</span>
                                <Switch defaultChecked disabled className="opacity-50 cursor-not-allowed data-[state=checked]:bg-red-500" />
                            </div>
                        </div>
                        <p className="text-[10px] text-neutral-600 italic">
                            {copy("*Critical alerts cannot be disabled via this terminal. Contact SysAdmin for override.")}
                        </p>
                    </div>

                    {/* Broadcast Channel */}
                    <Separator className="bg-white/10" />

                    <div className="space-y-4">
                        <h3 className="text-xs font-bold text-neutral-500 uppercase flex items-center gap-2">
                            <RadioTower className="size-3.5" /> {copy("Broadcast Channel")}
                        </h3>

                        <form onSubmit={handleSendMessage} className="space-y-3 p-4 rounded-xl border border-white/10 bg-white/5">
                            <div className="space-y-1">
                                <Label className="text-[10px] text-neutral-400 uppercase tracking-widest">{copy("Titre")}</Label>
                                <Input
                                    placeholder={copy("Titre de l'alerte")}
                                    className="h-8 text-xs bg-black/50 border-white/10"
                                    value={sendForm.title}
                                    onChange={e => setSendForm(prev => ({ ...prev, title: e.target.value }))}
                                    required
                                />
                            </div>

                            <div className="space-y-1">
                                <Label className="text-[10px] text-neutral-400 uppercase tracking-widest">{copy("Message")}</Label>
                                <Textarea
                                    placeholder={copy("Contenu...")}
                                    className="min-h-[60px] text-xs bg-black/50 border-white/10 resize-none"
                                    value={sendForm.message}
                                    onChange={e => setSendForm(prev => ({ ...prev, message: e.target.value }))}
                                    required
                                />
                            </div>

                            <div className="space-y-1">
                                <Label className="text-[10px] text-neutral-400 uppercase tracking-widest">{copy("Cible (Optionnel)")}</Label>
                                <Input
                                    placeholder={copy("ID Utilisateur (laisser vide pour TOUS)")}
                                    className="h-8 text-xs bg-black/50 border-white/10"
                                    value={sendForm.targetUserId}
                                    onChange={e => setSendForm(prev => ({ ...prev, targetUserId: e.target.value }))}
                                />
                            </div>

                            <Button
                                type="submit"
                                disabled={isSending}
                                className="w-full h-8 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white mt-2"
                            >
                                {isSending ? copy("Transmission...") : copy("Envoyer Signal")}
                            </Button>
                        </form>
                    </div>

                </div>

                {/* Footer Actions */}
                <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10 bg-black/90 backdrop-blur-md">
                    <Button onClick={onClose} className="w-full bg-white text-black font-bold hover:bg-neutral-200">
                        <Save className="size-4 mr-2" /> {copy("UPDATE PROTOCOLS")}
                    </Button>
                </div>

            </SheetContent>
        </Sheet>
    );
}
