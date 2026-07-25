"use client";

import { ActivityLog } from "@/types/admin";
import { cn } from "@/lib/utils";
import { Terminal, CreditCard, UserPlus, FileText, AlertTriangle, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/use-i18n";

interface LiveTerminalProps {
    logs: ActivityLog[];
}

export function LiveTerminal({ logs }: LiveTerminalProps) {
    const { copy } = useI18n();
    // Icons based on log type
    const icons: Record<string, React.ElementType> = {
        user: UserPlus,
        payment: CreditCard,
        system: FileText,
        security: ShieldAlert,
        alert: AlertTriangle,
    };

    return (
        <div className="flex flex-col h-[400px] overflow-hidden rounded-3xl bg-black border border-white/10 shadow-2xl backdrop-blur-xl">
            {/* Terminal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-2">
                    <Terminal className="size-4 text-neutral-500" />
                    <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">{copy("Flux d'activité")}</span>
                </div>
                <div className="flex gap-1.5">
                    <div className="size-2 rounded-full bg-red-500/20 border border-red-500/30" />
                    <div className="size-2 rounded-full bg-yellow-500/20 border border-yellow-500/30" />
                    <div className="size-2 rounded-full bg-emerald-500/20 border border-emerald-500/30" />
                </div>
            </div>

            {/* Terminal Content */}
            <div className="flex-1 p-4 overflow-y-auto space-y-2 scrollbar-hide font-mono text-xs sm:text-sm">
                {logs.map((log) => {
                    const statusColor =
                        log.status === "success" ? "text-emerald-400" :
                            log.status === "error" ? "text-red-400" :
                                log.status === "warning" ? "text-amber-400" : "text-blue-400";

                    const Icon = icons[log.type] || FileText;

                    return (
                        <div key={log.id} className="group flex items-start gap-3 p-3 rounded-lg hover:bg-white/5 transition-colors border border-transparent hover:border-white/5">
                            <span className="text-neutral-600 shrink-0 select-none">[{log.timestamp}]</span>

                            <div className="flex-1 space-y-1">
                                <div className="flex items-center gap-2">
                                    <Icon className={cn("size-3.5", statusColor)} />
                                    <span className={cn("font-bold", statusColor)}>
                                        {log.type.toUpperCase()}
                                    </span>
                                    <span className="text-neutral-300">
                                        {log.message}
                                    </span>
                                </div>
                                {log.details && (
                                    <div className="pl-6 text-neutral-500 text-[10px] break-all">
                                        &gt; {log.details}
                                    </div>
                                )}
                            </div>

                            <div className={cn("w-1.5 h-1.5 rounded-full mt-1.5 animate-pulse", statusColor)} />
                        </div>
                    );
                })}

                {/* Blinking Cursor at the end */}
                <div className="flex items-center gap-2 p-3 text-emerald-500/50 animate-pulse">
                    <span>_</span>
                </div>
            </div>
        </div>
    );
}
