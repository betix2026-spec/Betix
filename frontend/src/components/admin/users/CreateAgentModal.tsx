"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { UserPlus, Save, Key, CreditCard, User, Eye, EyeOff } from "lucide-react";
import { useState, useEffect } from "react";
import { createAgentAction, getPlansAction } from "@/app/(admin)/admin/users/actions";
import { toast } from "sonner";
import { useI18n } from "@/lib/use-i18n";

interface CreateAgentModalProps {
    open: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

export function CreateAgentModal({ open, onClose, onSuccess }: CreateAgentModalProps) {
    const { copy, t } = useI18n();
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [plans, setPlans] = useState<any[]>([]);

    // Form state
    const [formData, setFormData] = useState({
        username: "",
        email: "",
        password: "",
        role: "user",
        plan_id: "free"
    });

    useEffect(() => {
        const fetchPlans = async () => {
            const result = await getPlansAction();
            if (result.success && result.data) {
                setPlans(result.data);
            }
        };
        if (open) {
            fetchPlans();
        }
    }, [open]);

    const handleChange = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async () => {
        // Basic validation
        if (!formData.username || !formData.email || !formData.password) {
            toast.error(t("adminFormRequiredFields"));
            return;
        }

        setIsLoading(true);

        try {
            const result = await createAgentAction(formData);

            if (result.success) {
                toast.success(t("adminUserCreated"));
                // Reset form
                setFormData({
                    username: "",
                    email: "",
                    password: "",
                    role: "user",
                    plan_id: "free"
                });
                if (onSuccess) onSuccess();
                onClose();
            } else {
                toast.error(`${copy("Erreur")}: ${result.error}`);
            }
        } catch (error) {
            toast.error(t("adminUnexpectedError"));
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Sheet open={open} onOpenChange={onClose}>
            <SheetContent className="w-full sm:max-w-lg border-l border-white/10 bg-black/95 backdrop-blur-xl p-0 shadow-2xl">
                <SheetHeader className="sr-only">
                    <SheetTitle>{t("adminCreateUserTitle")}</SheetTitle>
                    <SheetDescription>{t("adminCreateUserDescription")}</SheetDescription>
                </SheetHeader>

                {/* Header */}
                <div className="h-24 bg-neutral-900 relative overflow-hidden border-b border-white/10">
                    <div className="absolute inset-0 bg-[linear-gradient(45deg,#000_25%,transparent_25%,transparent_50%,#000_50%,#000_75%,transparent_75%,transparent)] bg-[length:20px_20px] opacity-20" />
                    <div className="absolute inset-0 flex items-center justify-between px-6">
                        <div className="flex items-center gap-3">
                            <div className="size-10 rounded-lg bg-neutral-800 flex items-center justify-center border border-white/10">
                                <UserPlus className="size-5 text-green-400" />
                            </div>
                            <div>
                                <h2 className="text-lg font-black text-white uppercase tracking-widest">{t("adminCreateUserTitle")}</h2>
                                <p className="text-[10px] font-mono text-neutral-500">{t("adminNewUserLabel")}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-6 space-y-8 overflow-y-auto h-[calc(100vh-6rem)]">

                    {/* Identity Section */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold text-neutral-500 uppercase flex items-center gap-2">
                            <User className="size-3.5" /> {t("adminIdentitySection")}
                        </h3>
                        <div className="grid gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-mono text-neutral-400">{t("adminUsernameLabel")} *</Label>
                                <Input
                                    value={formData.username}
                                    onChange={(e) => handleChange("username", e.target.value)}
                                    className="bg-white/5 border-white/10 text-white"
                                    placeholder={t("adminUsernamePlaceholder")}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-mono text-neutral-400">{t("adminEmailLabel")} *</Label>
                                <Input
                                    value={formData.email}
                                    onChange={(e) => handleChange("email", e.target.value)}
                                    className="bg-white/5 border-white/10 text-white"
                                    placeholder="ex: smith@betix.io"
                                />
                            </div>
                        </div>
                    </div>

                    <Separator className="bg-white/5" />

                    {/* Security Section */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold text-neutral-500 uppercase flex items-center gap-2">
                            <Key className="size-3.5" /> {t("adminAccessSection")}
                        </h3>
                        <div className="space-y-2">
                            <Label className="text-xs font-mono text-neutral-400">{t("adminPasswordLabel")} *</Label>
                            <div className="relative">
                                <Input
                                    type={showPassword ? "text" : "password"}
                                    placeholder={t("adminPasswordHintMin")}
                                    value={formData.password}
                                    onChange={(e) => handleChange("password", e.target.value)}
                                    className="bg-white/5 border-white/10 text-white placeholder:text-neutral-600 pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white"
                                >
                                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                </button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-mono text-neutral-400">{t("adminRoleLabel")}</Label>
                            <Select value={formData.role} onValueChange={(v) => handleChange("role", v)}>
                                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                                    <SelectValue placeholder={t("adminSelectRole")} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="user">{t("adminRoleUser")}</SelectItem>
                                    <SelectItem value="admin">{t("adminRoleAdmin")}</SelectItem>
                                    <SelectItem value="super_admin">{t("adminRoleSuperAdmin")}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <Separator className="bg-white/5" />

                    {/* Subscription Section */}
                    <div className="space-y-4">
                        <h3 className="text-xs font-bold text-neutral-500 uppercase flex items-center gap-2">
                            <CreditCard className="size-3.5" /> {t("adminSubscriptionSection")}
                        </h3>
                        <div className="space-y-2">
                            <Label className="text-xs font-mono text-neutral-400">{t("adminInitialPlanLabel")}</Label>
                            <Select value={formData.plan_id} onValueChange={(v) => handleChange("plan_id", v)}>
                                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                                    <SelectValue placeholder={t("adminSelectPlan")} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="free">{t("adminPlanFree")}</SelectItem>
                                    {plans.filter(p => p.id !== 'free').map((plan) => (
                                        <SelectItem key={plan.id} value={plan.id}>
                                            {plan.name} ({plan.price}€)
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                </div>

                {/* Footer Actions */}
                <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10 bg-black/90 backdrop-blur-md flex gap-3">
                    <Button variant="ghost" className="flex-1 text-neutral-400 hover:text-white hover:bg-white/5" onClick={onClose}>
                        {t("adminCancelButton")}
                    </Button>
                    <Button
                        className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold"
                        onClick={handleSubmit}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            t("adminCreatingButton")
                        ) : (
                            <>
                                <Save className="size-4 mr-2" /> {t("adminConfirmCreateButton")}
                            </>
                        )}
                    </Button>
                </div>

            </SheetContent>
        </Sheet>
    );
}
