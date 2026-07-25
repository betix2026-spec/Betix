"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { RadioTower, Settings, MessageSquare, ShieldAlert } from "lucide-react";
import { useI18n } from "@/lib/use-i18n";

interface SignalProcessorProps {
    filter: "all" | "system" | "user" | "critical";
    counts: { all: number; system: number; user: number; critical: number };
    onFilterChange: (filter: "all" | "system" | "user" | "critical") => void;
}

export function SignalProcessor({ filter, counts, onFilterChange }: SignalProcessorProps) {
    const { copy } = useI18n();
    const frequencies = [
        { id: "all", label: copy("ALL_FREQUENCIES"), icon: RadioTower, color: "text-neutral-400" },
        { id: "system", label: copy("SYSTEM_CORE"), icon: Settings, color: "text-blue-400" },
        { id: "user", label: copy("AGENT_COMMS"), icon: MessageSquare, color: "text-emerald-400" },
        { id: "critical", label: copy("CRITICAL_ALERTS"), icon: ShieldAlert, color: "text-red-500" },
    ] as const;

    return (
        <div className="flex flex-wrap gap-2 p-1 bg-black/40 backdrop-blur-md rounded-xl border border-white/5">
            {frequencies.map((freq) => {
                const isActive = filter === freq.id;
                const count = counts[freq.id];

                return (
                    <button
                        key={freq.id}
                        onClick={() => onFilterChange(freq.id)}
                        className={cn(
                            "relative flex items-center gap-3 px-4 py-2 rounded-lg transition-all duration-300 group overflow-hidden",
                            isActive
                                ? "bg-white/10 shadow-[inner_0_0_10px_rgba(255,255,255,0.05)] border border-white/10"
                                : "hover:bg-white/5 border border-transparent"
                        )}
                    >
                        {/* Active Indicator Line */}
                        {isActive && (
                            <div className={cn("absolute bottom-0 left-0 right-0 h-[2px]",
                                freq.id === 'critical' ? 'bg-red-500 shadow-[0_0_10px_#ef4444]' : 'bg-white shadow-[0_0_10px_white]'
                            )} />
                        )}

                        <freq.icon className={cn("size-4 transition-colors", isActive ? "text-white" : "text-neutral-500 group-hover:text-neutral-300")} />

                        <span className={cn("text-xs font-bold font-mono tracking-wider transition-colors", isActive ? "text-white" : "text-neutral-500 group-hover:text-neutral-300")}>
                            {freq.label}
                        </span>

                        {count > 0 && (
                            <Badge
                                variant="secondary"
                                className={cn(
                                    "ml-1 h-5 min-w-[1.25rem] px-1 flex items-center justify-center text-[9px] font-mono border-0",
                                    isActive ? "bg-white text-black" : "bg-white/10 text-neutral-400"
                                )}
                            >
                                {count}
                            </Badge>
                        )}

                        {/* Scanline Effect on Hover */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-shimmer pointer-events-none" />
                    </button>
                );
            })}
        </div>
    );
}
