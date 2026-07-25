import { useState } from "react";
import { UserProfile } from "@/types/user";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Bell, Mail, Moon, Settings, LogOut, Trash2, Shield } from "lucide-react";
import { FootballIcon, TennisIcon, BasketballIcon } from "@/components/icons/SportIcons";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth/AuthProvider";
import { toast } from "sonner";
import { DeleteAccountDialog } from "./DeleteAccountDialog";
import { SportsSelectionDialog } from "./SportsSelectionDialog";
import { ContactSupportDialog } from "./ContactSupportDialog";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/use-i18n";

import { MFASettings } from "./MFASettings";

interface ControlDeckProps {
    profile: UserProfile;
}

export function ControlDeck({ profile }: ControlDeckProps) {
    const { copy } = useI18n();
    const { signOut } = useAuth();
    const supabase = createClient();

    // Optimistic state
    const [notifications, setNotifications] = useState(profile.preferences.notifications);
    const [newsletter, setNewsletter] = useState(profile.preferences.newsletter);

    const handleToggle = async (key: 'notifications_push' | 'newsletter_opt_in', value: boolean, setter: (v: boolean) => void) => {
        // Optimistic update
        setter(value);

        try {
            const { error } = await supabase
                .from('user_settings')
                .update({ [key]: value })
                .eq('user_id', profile.id);

            if (error) throw error;
            toast.success(copy("Préférence sauvegardée"));
        } catch (err) {
            console.error(err);
            toast.error(copy("Erreur lors de la sauvegarde"));
            setter(!value); // Revert
        }
    };

    const getSportIcon = (id: string) => {
        switch (id) {
            case 'football': return FootballIcon;
            case 'basketball': return BasketballIcon;
            case 'tennis': return TennisIcon;
            default: return Shield;
        }
    };

    const getSportColor = (id: string) => {
        switch (id) {
            case 'football': return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
            case 'basketball': return "text-orange-500 bg-orange-500/10 border-orange-500/20";
            case 'tennis': return "text-amber-500 bg-amber-500/10 border-amber-500/20";
            default: return "text-neutral-500 border-white/10";
        }
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-bottom-8 duration-700 delay-300">

            {/* Preferences Column */}
            <div className="space-y-6">
                <div className="p-6 rounded-3xl bg-black/40 border border-white/10 backdrop-blur-xl">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-500 mb-6 flex items-center gap-2">
                        <Settings className="size-4" /> {copy("Préférences Système")}
                    </h3>

                    <div className="space-y-6">
                        {/* Notifications */}
                        <div className="flex items-center justify-between group">
                            <div className="flex items-center gap-3">
                                <div className="size-10 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                                    <Bell className="size-5 text-neutral-300" />
                                </div>
                                <div>
                                    <p className="font-medium text-white">{copy("Notifications Push")}</p>
                                    <p className="text-xs text-neutral-500">{copy("Alertes de début de match")}</p>
                                </div>
                            </div>
                            <Switch
                                checked={notifications}
                                onCheckedChange={(c) => handleToggle('notifications_push', c, setNotifications)}
                            />
                        </div>

                        {/* Newsletter */}
                        <div className="flex items-center justify-between group">
                            <div className="flex items-center gap-3">
                                <div className="size-10 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-colors">
                                    <Mail className="size-5 text-neutral-300" />
                                </div>
                                <div>
                                    <p className="font-medium text-white">{copy("Newsletter Hebdo")}</p>
                                    <p className="text-xs text-neutral-500">{copy("Récapitulatif de vos stats")}</p>
                                </div>
                            </div>
                            <Switch
                                checked={newsletter}
                                onCheckedChange={(c) => handleToggle('newsletter_opt_in', c, setNewsletter)}
                            />
                        </div>

                        {/* Theme */}
                        <div className="flex items-center justify-between group opacity-50 cursor-not-allowed" title={copy("Thème Dark forcé")}>
                            <div className="flex items-center gap-3">
                                <div className="size-10 rounded-full bg-white/5 flex items-center justify-center">
                                    <Moon className="size-5 text-neutral-300" />
                                </div>
                                <div>
                                    <p className="font-medium text-white">{copy("Mode Sombre")}</p>
                                    <p className="text-xs text-neutral-500">{copy("Toujours activé sur Betix")}</p>
                                </div>
                            </div>
                            <Switch checked={true} disabled />
                        </div>
                    </div>
                </div>
            </div>

            {/* Sports & Security Column */}
            <div className="space-y-6">
                {/* Security Clearance (MFA) */}
                {/* TODO: Restore Security Clearance in future version */}
                {false && <MFASettings />}

                {/* Sports Interests */}
                <div className="p-6 rounded-3xl bg-black/40 border border-white/10 backdrop-blur-xl">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-500 flex items-center gap-2">
                            <Shield className="size-4" /> {copy("Sports Suivis")}
                        </h3>
                        <SportsSelectionDialog
                            currentFavorites={profile.preferences.favoriteSports}
                            userId={profile.id}
                            trigger={
                                <Button variant="ghost" size="sm" className="h-6 text-[10px] uppercase font-bold text-primary hover:text-primary/80">{copy("Modifier")}</Button>
                            }
                        />
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {profile.preferences.favoriteSports.map(sportId => {
                            const Icon = getSportIcon(sportId);
                            const style = getSportColor(sportId);
                            return (
                                <Badge key={sportId} variant="outline" className={cn("h-9 px-4 rounded-xl gap-2 transition-colors", style)}>
                                    <Icon size={14} /> <span className="capitalize">{sportId}</span>
                                </Badge>
                            );
                        })}

                        <SportsSelectionDialog
                            currentFavorites={profile.preferences.favoriteSports}
                            userId={profile.id}
                            trigger={
                                <Badge variant="outline" className="h-9 px-4 rounded-xl border-dashed border-white/10 text-neutral-500 hover:border-white/20 hover:text-white cursor-pointer transition-colors bg-transparent">
                                    {copy("+ Ajouter")}
                                </Badge>
                            }
                        />
                    </div>
                </div >

                {/* Support & Assistance */}
                <div className="p-6 rounded-3xl bg-blue-500/5 border border-blue-500/10 backdrop-blur-xl">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-blue-400 mb-4 flex items-center gap-2">
                        {copy("Assistance")}
                    </h3>
                    <ContactSupportDialog
                        trigger={
                            <Button variant="outline" className="w-full border-blue-500/20 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300 gap-2 h-12">
                                <Mail className="size-4" /> {copy("Contacter le Support")}
                            </Button>
                        }
                    />
                </div>

                {/* Account Actions */}
                <div className="p-6 rounded-3xl bg-red-500/5 border border-red-500/10 backdrop-blur-xl">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-red-400 mb-4 flex items-center gap-2">
                        {copy("Zone Critique")}
                    </h3>
                    <div className="flex gap-3">
                        <Button
                            variant="outline"
                            className="flex-1 border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                            onClick={() => signOut()}
                        >
                            <LogOut className="size-4 mr-2" /> {copy("Déconnexion")}
                        </Button>

                        <DeleteAccountDialog
                            trigger={
                                <Button variant="outline" className="flex-1 border-red-500/20 text-red-400 hover:bg-red-500/10 hover:text-red-300">
                                    <Trash2 className="size-4 mr-2" /> {copy("Supprimer")}
                                </Button>
                            }
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
