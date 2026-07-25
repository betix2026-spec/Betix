"use client";

import { CortexConfig } from "@/components/admin/settings/CortexConfig";
import { SystemBreakers } from "@/components/admin/settings/SystemBreakers";
import { OrchestratorControl } from "@/components/admin/settings/OrchestratorControl";
import { VisualConfig } from "@/components/admin/settings/VisualConfig";
import { Button } from "@/components/ui/button";
import { Terminal, Save } from "lucide-react";
import { useI18n } from "@/lib/use-i18n";

export default function AdminSettingsPage() {
    const { copy } = useI18n();
    return (
        <div className="space-y-12 animate-fade-in pb-12 max-w-7xl mx-auto">

            {/* Command Header */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-white/10 pb-6">
                <div>
                    <h1 className="text-4xl font-black uppercase tracking-tight text-white mb-2">{copy("The Core")}</h1>
                    <p className="text-sm font-mono text-neutral-500 flex items-center gap-2">
                        <Terminal className="size-3.5" /> {copy("SYSTEM_ROOT_ACCESS_GRANTED")}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Button variant="outline" className="border-white/10 text-neutral-400 hover:text-white hover:bg-white/5 font-mono text-xs">
                        {copy("VIEW_LOGS")}
                    </Button>
                    <Button className="bg-blue-600 hover:bg-blue-500 text-white font-bold tracking-wide shadow-[0_0_20px_-5px_rgba(37,99,235,0.5)]">
                        <Save className="size-4 mr-2" /> {copy("COMMIT_CHANGES")}
                    </Button>
                </div>
            </div>

            {/* 1. Visual Configuration */}
            <section className="space-y-4">
                <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-600 px-2 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-pink-500 rounded-full animate-pulse" />
                    {copy("Visual Configuration")}
                </h2>
                <VisualConfig />
            </section>

            {/* 3. Cortex Configuration (IA) */}
            <section className="space-y-4">
                <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-600 px-2 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                    {copy("Cortex Overclocking")}
                </h2>
                <CortexConfig />
            </section>

            {/* 4. Orchestrator Control */}
            <section className="space-y-4">
                <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-600 px-2 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-pulse" />
                    {copy("Orchestrator Control")}
                </h2>
                <OrchestratorControl />
            </section>

            {/* 5. System Breakers (App Settings) */}
            <section className="space-y-4">
                <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-600 px-2 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                    {copy("System Breakers")}
                </h2>
                <SystemBreakers />
            </section>

        </div>
    );
}
