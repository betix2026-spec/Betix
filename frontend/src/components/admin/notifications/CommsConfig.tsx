"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioTower, Bell, Mail, Smartphone, Volume2, Save, Languages, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { adminSendNotificationAction, translateNotificationDraftAction } from "@/app/actions/notifications";
import { useI18n } from "@/lib/use-i18n";
import { LOCALE_LABELS } from "@/lib/i18n";

interface CommsConfigProps {
    open: boolean;
    onClose: () => void;
}

type DraftTranslations = {
    title: { en: string; es: string; de: string };
    message: { en: string; es: string; de: string };
};

const EMPTY_TRANSLATIONS: DraftTranslations = {
    title: { en: "", es: "", de: "" },
    message: { en: "", es: "", de: "" },
};

export function CommsConfig({ open, onClose }: CommsConfigProps) {
    const { copy, t } = useI18n();
    const [isSending, setIsSending] = useState(false);
    const [isTranslating, setIsTranslating] = useState(false);
    const [sendForm, setSendForm] = useState({ title: "", message: "", targetUserId: "" });
    const [translations, setTranslations] = useState<DraftTranslations | null>(null);

    const updateBaseField = (field: "title" | "message", value: string) => {
        setSendForm(prev => ({ ...prev, [field]: value }));
        // Editing the French source invalidates any translations drafted for the old text
        setTranslations(null);
    };

    const handleGenerateTranslations = async () => {
        if (!sendForm.title.trim() || !sendForm.message.trim()) return;
        setIsTranslating(true);
        try {
            const result = await translateNotificationDraftAction(sendForm.title, sendForm.message);
            if (!result.success) throw new Error(result.error);

            setTranslations({
                title: {
                    en: result.title?.en || "",
                    es: result.title?.es || "",
                    de: result.title?.de || "",
                },
                message: {
                    en: result.message?.en || "",
                    es: result.message?.es || "",
                    de: result.message?.de || "",
                },
            });
        } catch (error) {
            toast.error(t("commsTranslationsError"));
        } finally {
            setIsTranslating(false);
        }
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!sendForm.title.trim() || !sendForm.message.trim()) return;

        setIsSending(true);
        try {
            const draft = translations || EMPTY_TRANSLATIONS;
            const result = await adminSendNotificationAction({
                title: sendForm.title,
                message: sendForm.message,
                title_en: draft.title.en || null,
                title_es: draft.title.es || null,
                title_de: draft.title.de || null,
                message_en: draft.message.en || null,
                message_es: draft.message.es || null,
                message_de: draft.message.de || null,
                targetUserId: sendForm.targetUserId.trim() || null,
                severity: 'info'
            });

            if (result.success) {
                toast.success(copy("Message envoyé avec succès."));
                setSendForm({ title: "", message: "", targetUserId: "" });
                setTranslations(null);
            } else {
                toast.error(result.error || copy("Échec de l'envoi."));
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
                    <SheetTitle>{t("commsConfigTitle")}</SheetTitle>
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
                            <h2 className="text-lg font-black text-white uppercase tracking-widest">{t("commsConfigTitle")}</h2>
                            <p className="text-[10px] font-mono text-neutral-500">{t("commsRoutingLabel")}</p>
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
                                        <Label className="text-sm font-bold text-white">{t("commsEmailLabel")}</Label>
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
                                        <p className="text-[10px] text-neutral-500">{t("commsRealtimeAlertsDescription")}</p>
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
                            <Volume2 className="size-3.5" /> {t("commsAlertLevelsSection")}
                        </h3>
                        <div className="p-3 rounded-lg border border-white/10 bg-white/5 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-mono text-neutral-400">{t("commsInfoLevel")}</span>
                                <Switch />
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-mono text-neutral-400">{t("commsWarningLevel")}</span>
                                <Switch defaultChecked />
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-mono text-red-400 font-bold">{t("commsCriticalLevel")}</span>
                                <Switch defaultChecked disabled className="opacity-50 cursor-not-allowed data-[state=checked]:bg-red-500" />
                            </div>
                        </div>
                        <p className="text-[10px] text-neutral-600 italic">
                            {t("commsCriticalAlertsNote")}
                        </p>
                    </div>

                    {/* Broadcast Channel */}
                    <Separator className="bg-white/10" />

                    <div className="space-y-4">
                        <h3 className="text-xs font-bold text-neutral-500 uppercase flex items-center gap-2">
                            <RadioTower className="size-3.5" /> {t("commsBroadcastSection")}
                        </h3>

                        <form onSubmit={handleSendMessage} className="space-y-3 p-4 rounded-xl border border-white/10 bg-white/5">
                            <div className="space-y-1">
                                <Label className="text-[10px] text-neutral-400 uppercase tracking-widest">{copy("Titre")}</Label>
                                <Input
                                    placeholder={copy("Titre de l'alerte")}
                                    className="h-8 text-xs bg-black/50 border-white/10"
                                    value={sendForm.title}
                                    onChange={e => updateBaseField("title", e.target.value)}
                                    required
                                />
                            </div>

                            <div className="space-y-1">
                                <Label className="text-[10px] text-neutral-400 uppercase tracking-widest">{copy("Message")}</Label>
                                <Textarea
                                    placeholder={copy("Contenu...")}
                                    className="min-h-[60px] text-xs bg-black/50 border-white/10 resize-none"
                                    value={sendForm.message}
                                    onChange={e => updateBaseField("message", e.target.value)}
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={!sendForm.title.trim() || !sendForm.message.trim() || isTranslating}
                                    onClick={handleGenerateTranslations}
                                    className="w-full h-7 text-[10px] font-bold uppercase gap-1.5 border-white/10 text-neutral-300 hover:text-white hover:bg-white/5"
                                >
                                    {isTranslating ? (
                                        <><Loader2 className="size-3 animate-spin" /> {t("commsTranslatingLabel")}</>
                                    ) : (
                                        <><Languages className="size-3" /> {t("commsGenerateTranslations")}</>
                                    )}
                                </Button>

                                {translations && (
                                    <div className="space-y-2 p-3 rounded-lg border border-white/10 bg-black/40">
                                        <p className="text-[9px] text-neutral-500 italic">{t("commsTranslationsHint")}</p>
                                        <div>
                                            <Label className="text-[9px] text-neutral-500 uppercase tracking-widest">{t("commsTranslationsLabel")}</Label>
                                            <div className="grid grid-cols-3 gap-2 mt-1">
                                                {(["en", "es", "de"] as const).map(lang => (
                                                    <Input
                                                        key={`title-${lang}`}
                                                        value={translations.title[lang]}
                                                        onChange={e => setTranslations(prev => prev && ({ ...prev, title: { ...prev.title, [lang]: e.target.value } }))}
                                                        placeholder={LOCALE_LABELS[lang]}
                                                        className="h-7 text-[10px] bg-black/50 border-white/10"
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2">
                                            {(["en", "es", "de"] as const).map(lang => (
                                                <Textarea
                                                    key={`message-${lang}`}
                                                    value={translations.message[lang]}
                                                    onChange={e => setTranslations(prev => prev && ({ ...prev, message: { ...prev.message, [lang]: e.target.value } }))}
                                                    placeholder={LOCALE_LABELS[lang]}
                                                    className="min-h-[50px] text-[10px] bg-black/50 border-white/10 resize-none"
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
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
                                {isSending ? t("commsSendingLabel") : t("commsSendButton")}
                            </Button>
                        </form>
                    </div>

                </div>

                {/* Footer Actions */}
                <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10 bg-black/90 backdrop-blur-md">
                    <Button onClick={onClose} className="w-full bg-white text-black font-bold hover:bg-neutral-200">
                        <Save className="size-4 mr-2" /> {t("adminSaveButton")}
                    </Button>
                </div>

            </SheetContent>
        </Sheet>
    );
}
