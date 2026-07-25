"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserProfile } from "@/types/user";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useI18n } from "@/lib/use-i18n";

interface ProfileEditDialogProps {
    profile: UserProfile;
    trigger: React.ReactNode;
}

export function ProfileEditDialog({ profile, trigger }: ProfileEditDialogProps) {
    const { copy } = useI18n();
    const [open, setOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [username, setUsername] = useState(profile.username);
    const [avatarKey, setAvatarKey] = useState(profile.avatar); // Fallback seed
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const supabase = createClient();
    const router = useRouter();
    const { refreshProfile } = useAuth();

    // Sync state when profile changes or dialog opens
    useEffect(() => {
        if (open) {
            setUsername(profile.username);
            setAvatarKey(profile.avatar);
            setSelectedFile(null);
            setPreviewUrl(null);
        }
    }, [open, profile.username, profile.avatar]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setSelectedFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleSave = async () => {
        setIsLoading(true);

        try {
            let finalAvatarUrl = profile.avatar; // Default to current

            // 1. Upload Image if selected
            if (selectedFile) {
                // DELETE old avatar if it's a supabase storage URL
                if (profile.avatar && profile.avatar.includes('/storage/v1/object/public/Users/')) {
                    try {
                        const oldPath = profile.avatar.split('/public/Users/')[1];
                        if (oldPath) {
                            console.log("Deleting old avatar:", oldPath);
                            await supabase.storage.from('Users').remove([oldPath]);
                        }
                    } catch (err) {
                        console.error("Error deleting old avatar:", err);
                        // We continue even if deletion fails (maybe file was already deleted)
                    }
                }

                const fileExt = selectedFile.name.split('.').pop();
                // Simplify path: just "Avatars/{userId}/avatar.{ext}" to overwrite easily or use timestamp
                const fileName = `Avatars/${profile.id}/avatar-${Date.now()}.${fileExt}`;

                const { error: uploadError } = await supabase.storage
                    .from('Users')
                    .upload(fileName, selectedFile, { upsert: true });

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('Users')
                    .getPublicUrl(fileName);

                finalAvatarUrl = publicUrl;
            } else if (avatarKey !== profile.avatar && (!profile.avatar || !profile.avatar.startsWith('http'))) {
                // If checking "Dicebear" logic: if avatarKey changed and it's not a URL, it's a seed
                // But if we want to support both, we need to know if avatarKey is a seed or URL.
                // Simplified: If no file selected, we generate the dicebear URL using the key/seed.
                finalAvatarUrl = `https://api.dicebear.com/9.x/avataaars/svg?seed=${avatarKey}`;
            }

            // 2. Update Profile
            const { error: updateError } = await supabase
                .from("profiles")
                .update({
                    username,
                    avatar_url: finalAvatarUrl
                })
                .eq("id", profile.id);

            if (updateError) throw updateError;

            toast.success(copy("Profil mis à jour !"));
            await refreshProfile();
            setOpen(false);
            router.refresh();
        } catch (error: any) {
            console.error("Upload Error Complete Object:", JSON.stringify(error, null, 2));
            console.error("Upload Error Message:", error.message || "No message property");
            toast.error(`${copy("Erreur")}: ${error.message || copy("Échec de la mise à jour (voir console).")}`);
        } finally {
            setIsLoading(false);
        }
    };

    const currentAvatar = previewUrl
        || (profile.avatar?.startsWith('http') ? profile.avatar : `https://api.dicebear.com/9.x/avataaars/svg?seed=${avatarKey}`);

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger}
            </DialogTrigger>
            <DialogContent className="bg-neutral-950/95 border-white/10 backdrop-blur-xl text-white sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold tracking-tight">{copy("Modifier le Profil")}</DialogTitle>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Username Input */}
                    <div className="space-y-2">
                        <Label htmlFor="username" className="text-neutral-400">{copy("Pseudo")}</Label>
                        <Input
                            id="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="bg-white/5 border-white/10 text-white focus:border-blue-500/50 focus:ring-blue-500/20"
                        />
                    </div>

                    {/* Avatar Selection */}
                    <div className="space-y-2">
                        <Label className="text-neutral-400">{copy("Avatar")}</Label>
                        <div className="flex items-center gap-4">
                            <div className="size-16 rounded-full overflow-hidden border-2 border-white/10 bg-black shrink-0 relative Group">
                                <img
                                    src={currentAvatar}
                                    alt="Avatar Preview"
                                    className="size-full object-cover"
                                />
                            </div>

                            <div className="flex flex-col gap-2 w-full">
                                <Input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileSelect}
                                    className="bg-white/5 border-white/10 text-xs file:text-white file:bg-white/10 file:border-0 file:rounded-md file:mr-2 cursor-pointer"
                                />
                                <div className="text-[10px] text-neutral-500 flex items-center gap-2">
                                    <span>{copy("OU")}</span>
                                    <Button
                                        type="button"
                                        variant="link"
                                        size="sm"
                                        className="text-blue-400 h-auto p-0"
                                        onClick={() => {
                                            setSelectedFile(null);
                                            setPreviewUrl(null);
                                            setAvatarKey(Math.random().toString(36).substring(7));
                                        }}
                                    >
                                        {copy("Générer un style aléatoire")}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
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
