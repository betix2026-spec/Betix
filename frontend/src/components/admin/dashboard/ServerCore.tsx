"use client";

import { SystemService } from "@/types/admin";
import { cn } from "@/lib/utils";
import { Activity, Server } from "lucide-react";
import { useI18n } from "@/lib/use-i18n";

interface ServerCoreProps {
    services: SystemService[];
}

export function ServerCore({ services }: ServerCoreProps) {
    const { copy, t } = useI18n();
    return (
        <div className="rounded-3xl bg-black/40 border border-white/10 backdrop-blur-xl p-6 h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                    <Activity className="size-5 text-neutral-500 animate-pulse" />
                    <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-500">{t("dashboardSystemStatus")}</h3>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 text-[10px] font-mono text-neutral-400">
                    <div className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    {copy("ONLINE")}
                </div>
            </div>

            {/* Cores Grid */}
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {services.map((service) => {
                    const statusColor =
                        service.status === "operational" ? "bg-emerald-500" :
                            service.status === "degraded" ? "bg-amber-500" :
                                service.status === "maintenance" ? "bg-blue-500" : "bg-red-500";

                    const textColor =
                        service.status === "operational" ? "text-emerald-400" :
                            service.status === "degraded" ? "text-amber-400" :
                                service.status === "maintenance" ? "text-blue-400" : "text-red-400";

                    return (
                        <div key={service.name} className="relative group overflow-hidden rounded-2xl bg-black border border-white/5 hover:border-white/10 transition-all p-4 flex items-center justify-between">

                            {/* Reactor Glow Background */}
                            <div className={cn("absolute -right-4 -bottom-4 size-24 rounded-full blur-[40px] opacity-10 group-hover:opacity-20 transition-opacity", statusColor)} />

                            <div className="flex items-center gap-4 relative z-10">
                                {/* The Core */}
                                <div className="relative size-12 flex items-center justify-center">
                                    <div className={cn("absolute inset-0 rounded-full opacity-20 animate-ping", statusColor)} />
                                    <div className={cn("relative size-8 rounded-full border-2 flex items-center justify-center shadow-[0_0_15px_currentColor]", textColor, `border-${textColor.split('-')[1]}-500/50`)}>
                                        <Server className="size-4" />
                                    </div>
                                </div>

                                <div>
                                    <h4 className="font-bold text-white text-sm">{service.name}</h4>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className={cn("text-[10px] uppercase font-bold tracking-wider", textColor)}>
                                            {copy(service.status)}
                                        </span>
                                        <span className="text-[10px] text-neutral-600 font-mono">
                                            {service.latency}ms
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Load Bar */}
                            <div className="h-full w-1 bg-white/5 rounded-full overflow-hidden ml-4">
                                <div
                                    className={cn("w-full rounded-full transition-all duration-1000", statusColor)}
                                    style={{ height: `${service.load}%`, marginTop: `${100 - service.load}%` }}
                                />
                            </div>

                        </div>
                    );
                })}
            </div>
        </div>
    );
}
