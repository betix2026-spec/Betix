"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Play, RefreshCw, CheckCircle2, XCircle, Zap } from "lucide-react";
import { useI18n } from "@/lib/use-i18n";

interface APIKeyConfig {
    id: string;
    name: string;
    value: string;
    status: "connected" | "error" | "untested";
    type: "core" | "external" | "financial";
}

const initialKeys: APIKeyConfig[] = [
    { id: "api-sports", name: "API-Sports (Data Feed)", value: "Configured in server environment", status: "untested", type: "core" },
    { id: "gemini", name: "Google Gemini (AI Engine)", value: "Configured in server environment", status: "untested", type: "core" },
    { id: "stripe", name: "Stripe (Payment Gateway)", value: "Configured in server environment", status: "untested", type: "financial" },
    { id: "supabase", name: "Supabase (Database)", value: "Configured in server environment", status: "untested", type: "external" },
];

export function NeuralUplinks() {
    const { t } = useI18n();
    const [keys, setKeys] = useState(initialKeys);
    const [testing, setTesting] = useState<string | null>(null);

    const handleTest = (id: string) => {
        setTesting(id);
        // Simulate network test
        setTimeout(() => {
            setTesting(null);
            setKeys(current => current.map(k =>
                k.id === id ? { ...k, status: Math.random() > 0.3 ? "connected" : "error" } : k
            ));
        }, 1500);
    };

    return (
        <div className="space-y-6">
            <div className="grid gap-4">
                {keys.map((key) => (
                    <div
                        key={key.id}
                        className={cn(
                            "relative group bg-black/40 border rounded-xl overflow-hidden transition-all duration-300",
                            key.status === "connected" ? "border-emerald-500/20 shadow-[0_0_15px_-5px_rgba(16,185,129,0.1)]" :
                                key.status === "error" ? "border-red-500/30 shadow-[0_0_15px_-5px_rgba(239,68,68,0.2)]" :
                                    "border-white/5"
                        )}
                    >
                        {/* Status Line (The Cable) */}
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-white/5 group-hover:bg-white/10 transition-colors">
                            <div className={cn(
                                "w-full transition-all duration-1000",
                                key.status === "connected" ? "h-full bg-emerald-500 shadow-[0_0_10px_#10b981]" :
                                    key.status === "error" ? "h-full bg-red-500 animate-pulse-fast shadow-[0_0_10px_#ef4444]" :
                                        "h-0"
                            )} />
                        </div>

                        <div className="p-5 pl-6 flex flex-col md:flex-row md:items-center gap-4">

                            <div className="flex-1 space-y-1">
                                <div className="flex items-center gap-2">
                                    <Label className="text-sm font-bold text-white">{key.name}</Label>
                                    <Badge variant="outline" className="text-[9px] border-white/10 text-neutral-500 uppercase tracking-wider">
                                        {key.type}
                                    </Badge>
                                </div>
                                <div className="relative group/input">
                                    <Input
                                        type="password"
                                        defaultValue={key.value}
                                        readOnly
                                        className="bg-black/50 border-white/5 text-neutral-400 font-mono text-xs h-9 pr-10 focus-visible:ring-0 focus-visible:border-white/20 transition-colors"
                                    />
                                    <div className="absolute right-0 top-0 bottom-0 w-10 flex items-center justify-center border-l border-white/5 bg-white/[0.02]">
                                        <div className={cn("size-2 rounded-full",
                                            key.status === "connected" ? "bg-emerald-500 animate-pulse" :
                                                key.status === "error" ? "bg-red-500" : "bg-neutral-700"
                                        )} />
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 md:w-48 justify-end">
                                {testing === key.id ? (
                                    <Button disabled variant="outline" size="sm" className="w-full bg-white/5 border-white/10 text-neutral-400 gap-2 font-mono text-xs">
                                        <RefreshCw className="size-3 animate-spin" /> {t("settingsTestingLabel")}
                                    </Button>
                                ) : (
                                    <Button
                                        onClick={() => handleTest(key.id)}
                                        variant="outline"
                                        size="sm"
                                        className={cn(
                                            "w-full border-white/10 bg-white/5 hover:bg-white/10 gap-2 font-mono text-xs transition-colors",
                                            key.status === "connected" ? "text-emerald-400 hover:text-emerald-300 hover:border-emerald-500/30" :
                                                key.status === "error" ? "text-red-400 hover:text-red-300 hover:border-red-500/30" :
                                                    "text-neutral-400 hover:text-white"
                                        )}
                                    >
                                        <Zap className="size-3" /> {t("settingsTestConnection")}
                                    </Button>
                                )}
                            </div>
                        </div>

                        {/* Error Message (if any) */}
                        {key.status === "error" && (
                            <div className="absolute top-2 right-2 flex gap-1">
                                <span className="flex h-2 w-2 relative">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                                </span>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <Button variant="outline" className="w-full border-dashed border-white/10 text-neutral-500 hover:text-white hover:bg-white/5 h-12 uppercase tracking-widest text-xs font-bold">
                {t("settingsAddIntegration")}
            </Button>
        </div>
    );
}
