"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Brain, Cpu, Zap, Thermometer } from "lucide-react";
import { useI18n } from "@/lib/use-i18n";

export function CortexConfig() {
    const { copy, t } = useI18n();
    const [temperature, setTemperature] = useState([0.7]);
    const [tokens, setTokens] = useState([2048]);

    // Calculate "Load" visual based on settings
    const loadPercentage = ((temperature[0] * 100) + (tokens[0] / 4096 * 100)) / 2;
    const isOverclocked = temperature[0] > 0.8 || tokens[0] > 3000;

    return (
        <div className="relative group overflow-hidden rounded-2xl bg-black/40 border border-white/10 backdrop-blur-xl p-6 transition-all duration-500 hover:border-blue-500/30">

            {/* Header */}
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <div className={cn("size-10 rounded-lg flex items-center justify-center border border-white/10 bg-white/5",
                        isOverclocked ? "text-red-400 animate-pulse" : "text-blue-400"
                    )}>
                        <Brain className="size-6" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-white uppercase tracking-tight">{t("settingsAiModelTitle")}</h2>
                        <div className="flex items-center gap-2 text-[10px] font-mono text-neutral-500">
                            <span>{t("settingsAiEngineLabel")}</span>
                            {isOverclocked && <span className="text-red-500 font-bold animate-pulse">{t("settingsHighCreativityBadge")}</span>}
                        </div>
                    </div>
                </div>

                {/* Chipset Selector */}
                <div className="w-48">
                    <Select defaultValue="gemini-2.5-flash">
                        <SelectTrigger className="bg-black/50 border-white/10 text-white h-9 text-xs font-mono">
                            <Cpu className="size-3.5 mr-2 text-neutral-400" />
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="gemini-2.5-flash">GEMINI 2.5 FLASH</SelectItem>
                            <SelectItem value="gemini-2.5-pro">GEMINI 2.5 PRO</SelectItem>
                            <SelectItem value="gemini-1.5-pro">LEGACY (1.5 PRO)</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">

                {/* Temperature Control */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                            <Thermometer className="size-3.5" /> {t("settingsCreativityLabel")}
                        </Label>
                        <span className={cn("font-mono font-bold text-sm",
                            temperature[0] > 0.8 ? "text-red-500" : "text-blue-400"
                        )}>
                            {temperature[0].toFixed(1)}
                        </span>
                    </div>
                    <div className="relative pt-2">
                        <div className="absolute top-0 w-full flex justify-between px-1 text-[8px] text-neutral-600 font-mono">
                            <span>{copy("FACTUAL")}</span>
                            <span>{copy("BALANCED")}</span>
                            <span>{copy("CREATIVE")}</span>
                        </div>
                        <Slider
                            value={temperature}
                            onValueChange={setTemperature}
                            min={0}
                            max={1}
                            step={0.1}
                            className={cn(temperature[0] > 0.8 ? "[&_.bg-primary]:bg-red-500" : "[&_.bg-primary]:bg-blue-500")}
                        />
                    </div>
                </div>

                {/* Tokens Control */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <Label className="text-xs font-bold uppercase tracking-widest text-neutral-400 flex items-center gap-2">
                            <Zap className="size-3.5" /> {copy("Max Output Tokens")}
                        </Label>
                        <span className="font-mono font-bold text-sm text-yellow-400">
                            {tokens[0]}
                        </span>
                    </div>
                    <div className="relative pt-2">
                        <div className="absolute top-0 w-full flex justify-between px-1 text-[8px] text-neutral-600 font-mono">
                            <span>{copy("ECO")}</span>
                            <span>{copy("STD")}</span>
                            <span>{copy("MAX")}</span>
                        </div>
                        <Slider
                            value={tokens}
                            onValueChange={setTokens}
                            min={512}
                            max={4096}
                            step={256}
                            className="[&_.bg-primary]:bg-yellow-500"
                        />
                    </div>
                </div>

            </div>

            {/* Background Effects */}
            <div
                className={cn("absolute inset-0 pointer-events-none transition-opacity duration-500",
                    isOverclocked ? "opacity-20" : "opacity-5"
                )}
            >
                <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-red-500/20 to-transparent" />
            </div>

        </div>
    );
}
