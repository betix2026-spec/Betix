"use client";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { UserCog, Save, Key, Shield, CreditCard, User, Eye, EyeOff } from "lucide-react";
import { useState, useEffect } from "react";
import { updateAgentAction, getPlansAction } from "@/app/(admin)/admin/users/actions";
import { toast } from "sonner";
import { useI18n } from "@/lib/use-i18n";

interface EditAgentModalProps {
    user: any | null; // Using any for now to match page state
    open: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

export function EditAgentModal({ user, open, onClose, onSuccess }: EditAgentModalProps) {
    const { copy, t } = useI18n();
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [plans, setPlans] = useState<any[]>([]);
    const [formData, setFormData] = useState({
        username: "",
        email: "",
        password: "",
        role: "",
        plan_id: "",
        status: ""
    });

    useEffect(() => {
        const fetchPlans = async () => {
            const result = await getPlansAction();
            if (result.success && result.data) {
                setPlans(result.data);
            }
        };
        fetchPlans();

        if (user) {
            setFormData({
                username: user.username || "",
                email: user.email || "",
                password: "", // Always empty initially
                role: user.role || "user",
                plan_id: user.plan_id || "free",
                status: user.status || "active"
            });
        }
    }, [user]);

    const handleChange = (field: string, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async () => {
        if (!user) return;
        setIsLoading(true);

        const updates: any = {};

        // Only include fields that changed
        if (formData.username !== user.username) updates.username = formData.username;
        if (formData.email !== user.email) updates.email = formData.email;
        if (formData.password) updates.password = formData.password;
        if (formData.role !== user.role) updates.role = formData.role;
        if (formData.plan_id !== user.plan_id) updates.plan_id = formData.plan_id;
        if (formData.status !== user.status) updates.subscription_status = formData.status;

        if (Object.keys(updates).length === 0) {
            onClose();
            return;
        }

        try {
            const result = await updateAgentAction(user.id, updates);

            if (result.success) {
                toast.success(t("adminUserUpdated"));
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

    if (!user) return null;

    return (
        <Sheet open={open} onOpenChange={onClose}>
            <SheetContent className="w-full sm:max-w-lg border-l border-white/10 bg-black/95 backdrop-blur-xl p-0 shadow-2xl">
                <SheetHeader className="sr-only">
                    <SheetTitle>{t("adminEditUserTitle")}: {user.username}</SheetTitle>
                    <SheetDescription>{t("adminEditUserDescription")}</SheetDescription>
                </SheetHeader>

                {/* Header */}
                <div className="h-24 bg-neutral-900 relative overflow-hidden border-b border-white/10">
                    <div className="absolute inset-0 bg-[linear-gradient(45deg,#000_25%,transparent_25%,transparent_50%,#000_50%,#000_75%,transparent_75%,transparent)] bg-[length:20px_20px] opacity-20" />
                    <div className="absolute inset-0 flex items-center justify-between px-6">
                        <div className="flex items-center gap-3">
                            <div className="size-10 rounded-lg bg-neutral-800 flex items-center justify-center border border-white/10">
                                <UserCog className="size-5 text-neutral-400" />
                            </div>
                            <div>
                                <h2 className="text-lg font-black text-white uppercase tracking-widest">{t("adminEditUserTitle")}</h2>
                                <p className="text-[10px] font-mono text-neutral-500">ID: {user.id.slice(0, 8)}...</p>
                            </div>
                        </div>
                        <Badge variant="outline" className="border-blue-500/50 text-blue-500 bg-blue-500/10 font-bold">
                            {t("adminEditingBadge")}
                        </Badge>
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
                                <Label className="text-xs font-mono text-neutral-400">{t("adminUsernameLabel")}</Label>
                                <Input
                                    value={formData.username}
                                    onChange={(e) => handleChange("username", e.target.value)}
                                    className="bg-white/5 border-white/10 text-white"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-mono text-neutral-400">{t("adminEmailLabel")}</Label>
                                <Input
                                    value={formData.email}
                                    onChange={(e) => handleChange("email", e.target.value)}
                                    className="bg-white/5 border-white/10 text-white"
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
                            <Label className="text-xs font-mono text-neutral-400">{t("adminResetPasswordLabel")}</Label>
                            <div className="relative">
                                <Input
                                    type={showPassword ? "text" : "password"}
                                    placeholder={t("adminPasswordPlaceholder")}
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
                            <p className="text-[10px] text-amber-500/80 font-mono">
                                ⚠ {t("adminPasswordWarning")}
                            </p>
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
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-mono text-neutral-400">{t("adminPlanTierLabel")}</Label>
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
                            <div className="space-y-2">
                                <Label className="text-xs font-mono text-neutral-400">{t("adminStatusLabel")}</Label>
                                <Select value={formData.status} onValueChange={(v) => handleChange("status", v)}>
                                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                                        <SelectValue placeholder={t("adminSelectStatus")} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="active">{copy("Active")}</SelectItem>
                                        <SelectItem value="past_due">{copy("Past Due")}</SelectItem>
                                        <SelectItem value="canceled">{copy("Canceled")}</SelectItem>
                                        <SelectItem value="suspended">{copy("Suspended")}</SelectItem>
                                        <SelectItem value="inactive">{copy("Inactive")}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Footer Actions */}
                <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10 bg-black/90 backdrop-blur-md flex gap-3">
                    <Button variant="ghost" className="flex-1 text-neutral-400 hover:text-white hover:bg-white/5" onClick={onClose}>
                        {t("adminCancelButton")}
                    </Button>
                    <Button
                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold"
                        onClick={handleSubmit}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            t("adminUpdatingButton")
                        ) : (
                            <>
                                <Save className="size-4 mr-2" /> {t("adminSaveButton")}
                            </>
                        )}
                    </Button>
                </div>

            </SheetContent>
        </Sheet>
    );
}
