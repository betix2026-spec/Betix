"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, Power, Wrench, RefreshCw, Download, Database } from "lucide-react";
import { FootballIcon, BasketballIcon, TennisIcon } from "@/components/icons/SportIcons";
import { useI18n } from "@/lib/use-i18n";

export function SystemBreakers() {
    const { copy } = useI18n();
    const [maintenance, setMaintenance] = useState(false);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Operational Sectors (Sports) */}
            <div className="rounded-2xl bg-black/40 border border-white/10 backdrop-blur-xl p-6">
                <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-6 flex items-center gap-2">
                    <Power className="size-3.5" /> {copy("Operational Sectors")}
                </h2>

                <div className="space-y-4">
                    {[
                        { label: copy("Football Operations"), icon: FootballIcon, active: true },
                        { label: copy("Basketball Operations"), icon: BasketballIcon, active: true },
                        { label: copy("Tennis Operations"), icon: TennisIcon, active: true },
                    ].map((sector, i) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 group hover:border-white/10 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="size-8 rounded-lg bg-black border border-white/10 flex items-center justify-center text-neutral-400">
                                    <sector.icon size={16} />
                                </div>
                                <span className="text-sm font-bold text-neutral-300">{sector.label}</span>
                            </div>
                            <Switch defaultChecked={sector.active} className="data-[state=checked]:bg-emerald-500" />
                        </div>
                    ))}
                </div>
            </div>

            {/* Maintenance & Emergency */}
            <div className={cn(
                "rounded-2xl border p-6 transition-all duration-500",
                maintenance ? "bg-red-500/10 border-red-500/50 shadow-[0_0_50px_-20px_rgba(239,68,68,0.3)]" : "bg-black/40 border-white/10 backdrop-blur-xl"
            )}>
                <div className="flex items-center justify-between mb-6">
                    <h2 className={cn("text-xs font-bold uppercase tracking-widest flex items-center gap-2", maintenance ? "text-red-500 animate-pulse" : "text-neutral-500")}>
                        <AlertTriangle className="size-3.5" /> {copy("Emergency Protocols")}
                    </h2>
                    {maintenance && <span className="text-[10px] font-mono font-bold text-red-500 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">{copy("SYSTEM LOCKDOWN")}</span>}
                </div>

                <div className="space-y-6">

                    {/* The Big Switch */}
                    <div className="flex items-center justify-between">
                        <div>
                            <Label className={cn("text-sm font-bold", maintenance ? "text-red-400" : "text-white")}>{copy("Maintenance Mode")}</Label>
                            <p className="text-xs text-neutral-500 mt-1">{copy("Restrict access to admin personnel only.")}</p>
                        </div>
                        <Switch
                            checked={maintenance}
                            onCheckedChange={setMaintenance}
                            className="data-[state=checked]:bg-red-500 border-2 border-transparent data-[state=checked]:border-red-400"
                        />
                    </div>

                    <Separator className={cn(maintenance ? "bg-red-500/20" : "bg-white/10")} />

                    {/* System Actions */}
                    <div className="grid grid-cols-2 gap-3">
                        <Button variant="outline" className="h-10 border-white/10 hover:bg-white/5 bg-transparent text-xs hover:text-white text-neutral-400">
                            <RefreshCw className="size-3.5 mr-2" /> {copy("FLUSH_CACHE")}
                        </Button>
                        <Button variant="outline" className="h-10 border-white/10 hover:bg-white/5 bg-transparent text-xs hover:text-white text-neutral-400">
                            <Database className="size-3.5 mr-2" /> {copy("REBUILD_INDEX")}
                        </Button>
                        <Button variant="outline" className="col-span-2 h-10 border-white/10 hover:bg-white/5 bg-transparent text-xs hover:text-white text-neutral-400">
                            <Download className="size-3.5 mr-2" /> {copy("EXPORT_SYSTEM_LOGS")}
                        </Button>
                    </div>

                </div>
            </div>

        </div>
    );
}
