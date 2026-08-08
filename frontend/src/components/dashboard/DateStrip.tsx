"use client";

import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/use-i18n";

function toDateStr(d: Date): string {
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0")].join("-");
}

interface DateStripProps {
    selected: string;
    onSelect: (date: string) => void;
    /** Days before today (finished tab looks back, upcoming looks forward). */
    daysBack?: number;
    daysForward?: number;
}

/** Horizontal day picker — the livescore-app date navigator, not a plain dropdown. */
export function DateStrip({ selected, onSelect, daysBack = 0, daysForward = 6 }: DateStripProps) {
    const { copy, locale } = useI18n();
    const localeTag = { fr: "fr-FR", en: "en-US", es: "es-ES", de: "de-DE" }[locale] || "en-US";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days: Date[] = [];
    for (let i = -daysBack; i <= daysForward; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        days.push(d);
    }

    return (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none mask-linear-fade pr-8">
            {days.map((d) => {
                const dateStr = toDateStr(d);
                const isSelected = dateStr === selected;
                const diffDays = Math.round((d.getTime() - today.getTime()) / 86400000);
                const label =
                    diffDays === 0
                        ? copy("Aujourd'hui")
                        : diffDays === 1
                            ? copy("Demain")
                            : diffDays === -1
                                ? copy("Hier")
                                : d.toLocaleDateString(localeTag, { weekday: "short" });
                const dayNum = d.toLocaleDateString(localeTag, { day: "numeric", month: "short" });

                return (
                    <button
                        key={dateStr}
                        onClick={() => onSelect(dateStr)}
                        className={cn(
                            "flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-xl border transition-all whitespace-nowrap shrink-0 min-w-[64px]",
                            isSelected
                                ? "bg-primary/20 text-primary border-primary/30 shadow-[0_0_10px_-2px_rgba(var(--primary),0.3)]"
                                : "bg-white/5 text-neutral-400 border-white/5 hover:bg-white/10 hover:text-white"
                        )}
                    >
                        <span className="text-[9px] uppercase font-bold tracking-widest capitalize">{label}</span>
                        <span className="text-[11px] font-mono font-semibold capitalize">{dayNum}</span>
                    </button>
                );
            })}
        </div>
    );
}

export { toDateStr };
