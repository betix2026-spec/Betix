"use client";

import { ShieldCheck } from "lucide-react";
import { useI18n } from "@/lib/use-i18n";

export function TrustBadge() {
    const { copy } = useI18n();
    return (
        <div className="relative group perspective-1000 size-48 mx-auto">
            <div className="relative w-full h-full transition-transform duration-700 transform-style-3d md:group-hover:rotate-y-180 animate-float">

                {/* Front Side */}
                <div className="absolute inset-0 backface-hidden flex items-center justify-center">
                    <div className="relative size-40 rounded-full border-4 border-amber-500/30 bg-black/80 backdrop-blur-md shadow-[0_0_50px_-10px_rgba(245,158,11,0.3)] flex items-center justify-center">
                        <div className="absolute inset-2 border border-dashed border-amber-500/50 rounded-full animate-spin-slow" />
                        <div className="flex flex-col items-center justify-center text-center p-4">
                            <ShieldCheck className="size-10 text-amber-500 mb-2" />
                            <span className="text-xl font-black text-white uppercase tracking-tighter">100%</span>
                            <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">{copy("NO RISK")}</span>
                            <span className="text-[8px] text-neutral-400 mt-1">{copy("ESSAYEZ PREMIUM")}</span>
                        </div>
                    </div>
                </div>

                {/* Back Side */}
                <div className="absolute inset-0 backface-hidden rotate-y-180 flex items-center justify-center">
                    <div className="relative size-40 rounded-full border-4 border-blue-500/30 bg-black/80 backdrop-blur-md shadow-[0_0_50px_-10px_rgba(59,130,246,0.3)] flex items-center justify-center">
                        <div className="absolute inset-2 border border-dashed border-blue-500/50 rounded-full animate-reverse-spin-slow" />
                        <div className="flex flex-col items-center justify-center text-center p-4">
                            <span className="text-3xl font-black text-white">100%</span>
                            <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mt-1">{copy("NO RISK")}</span>
                            <span className="text-[8px] text-neutral-400 mt-1">{copy("ESSAYEZ PREMIUM")}</span>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
