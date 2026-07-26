"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, Brain, Database, Radio, Clock, Cpu, Zap } from "lucide-react";
import { FootballIcon, BasketballIcon, TennisIcon } from "@/components/icons/SportIcons";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/use-i18n";

interface ConfigMap {
    [key: string]: string;
}

// Defaults matching the migration seed values
const DEFAULTS: ConfigMap = {
    // Live
    "orch_live.enabled": "true",
    "orch_live.monitor_interval_s": "120",
    "orch_live.mark_live_every_n": "2",
    "orch_live.mark_imminent_every_n": "8",
    // Data
    "orch_data.enabled": "true",
    "orch_data.sleep_interval_s": "60",
    "orch_data.discovery_every_n": "360",
    "orch_data.cleanup_every_n": "480",
    "orch_data.discovery_days": "10",
    // AI
    "orch_ai.enabled": "true",
    "orch_ai.check_interval_s": "300",
    "orch_ai.tolerance_min": "10",
    "orch_ai.scan_days": "3",
    "orch_ai.audit_pause_s": "3",
    "orch_ai.run1_hour": "8",
    "orch_ai.run2_hour": "14",
    "orch_ai.run3_hour": "18",
    "orch_ai.run4_hour": "22",
    // AI per sport
    "orch_ai.football.enabled": "true",
    "orch_ai.football.runs_per_day": "2",
    "orch_ai.football.provider": "claude",
    "orch_ai.football.model": "claude-haiku-4-5-20251001",
    "orch_ai.basketball.enabled": "true",
    "orch_ai.basketball.runs_per_day": "3",
    "orch_ai.basketball.provider": "claude",
    "orch_ai.basketball.model": "claude-haiku-4-5-20251001",
    "orch_ai.tennis.enabled": "true",
    "orch_ai.tennis.runs_per_day": "4",
    "orch_ai.tennis.provider": "claude",
    "orch_ai.tennis.model": "claude-haiku-4-5-20251001",
};

const SPORTS = [
    { key: "football", label: "Football", icon: FootballIcon, color: "emerald" },
    { key: "basketball", label: "Basketball", icon: BasketballIcon, color: "orange" },
    { key: "tennis", label: "Tennis", icon: TennisIcon, color: "yellow" },
] as const;

const AI_MODELS = [
    { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
    { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini" },
    { value: "gpt-4o", label: "GPT-4o" },
];

const AI_PROVIDERS = [
    { value: "claude", label: "Claude (Anthropic)" },
    { value: "gemini", label: "Gemini (Google)" },
    { value: "gpt", label: "GPT (OpenAI)" },
];

export function OrchestratorControl() {
    const { copy } = useI18n();
    const [cfg, setCfg] = useState<ConfigMap>({ ...DEFAULTS });
    const [loading, setLoading] = useState(true);
    const supabase = createClient();

    useEffect(() => {
        fetchAll();

        const channel = supabase
            .channel("orch_config_changes")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "system_config" },
                (payload) => {
                    const rec = payload.new as { key: string; value: string };
                    if (rec?.key?.startsWith("orch_")) {
                        setCfg((prev) => ({ ...prev, [rec.key]: rec.value }));
                    }
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

    const fetchAll = async () => {
        try {
            const { data, error } = await supabase
                .from("system_config")
                .select("key, value")
                .like("key", "orch_%");

            if (error) throw error;

            const map: ConfigMap = { ...DEFAULTS };
            data?.forEach((r: { key: string; value: string }) => { map[r.key] = r.value; });
            setCfg(map);
        } catch (e) {
            console.error("Failed to fetch orchestrator config:", e);
            toast.error(copy("Erreur de chargement de la configuration orchestrateurs."));
        } finally {
            setLoading(false);
        }
    };

    const save = async (key: string, value: string) => {
        try {
            const { error } = await supabase
                .from("system_config")
                .upsert({ key, value, updated_at: new Date().toISOString() });

            if (error) throw error;
            setCfg((prev) => ({ ...prev, [key]: value }));
            toast.success(`${key} updated.`);
        } catch (e: any) {
            console.error("Config save error:", e);
            toast.error(`${copy("Erreur")}: ${e.message || copy("inconnue")}`);
        }
    };

    if (loading) return <div className="h-96 animate-pulse bg-white/5 rounded-xl" />;

    const isEnabled = (key: string) => cfg[key] === "true";

    return (
        <div className="space-y-6">

            {/* ============================================ */}
            {/* ORCHESTRATOR LIVE */}
            {/* ============================================ */}
            <Card className={cn(
                "bg-black/40 border-emerald-500/20 backdrop-blur-sm transition-all",
                !isEnabled("orch_live.enabled") && "opacity-50"
            )}>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <CardTitle className="text-white flex items-center gap-2 text-base">
                                <Radio className="size-4 text-emerald-500" />
                                Orchestrator Live
                            </CardTitle>
                            <CardDescription className="text-neutral-400 text-xs">
                                {copy("Monitoring des scores en direct, detection imminent/live.")}
                            </CardDescription>
                        </div>
                        <Switch
                            checked={isEnabled("orch_live.enabled")}
                            onCheckedChange={(v) => save("orch_live.enabled", v ? "true" : "false")}
                            className="data-[state=checked]:bg-emerald-500"
                        />
                    </div>
                </CardHeader>
                {isEnabled("orch_live.enabled") && (
                    <CardContent className="space-y-3 pt-0">
                        <ConfigRow label={copy("Cycle principal")} unit="s" configKey="orch_live.monitor_interval_s" value={cfg} onSave={save} />
                        <ConfigRow label={copy("Mark Live (toutes les N iter.)")} configKey="orch_live.mark_live_every_n" value={cfg} onSave={save} />
                        <ConfigRow label={copy("Mark Imminent (toutes les N iter.)")} configKey="orch_live.mark_imminent_every_n" value={cfg} onSave={save} />
                    </CardContent>
                )}
            </Card>

            {/* ============================================ */}
            {/* ORCHESTRATOR DATA */}
            {/* ============================================ */}
            <Card className={cn(
                "bg-black/40 border-blue-500/20 backdrop-blur-sm transition-all",
                !isEnabled("orch_data.enabled") && "opacity-50"
            )}>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <CardTitle className="text-white flex items-center gap-2 text-base">
                                <Database className="size-4 text-blue-500" />
                                Orchestrator Data
                            </CardTitle>
                            <CardDescription className="text-neutral-400 text-xs">
                                {copy("Ingestion matchs, cotes, nettoyage quotidien.")}
                            </CardDescription>
                        </div>
                        <Switch
                            checked={isEnabled("orch_data.enabled")}
                            onCheckedChange={(v) => save("orch_data.enabled", v ? "true" : "false")}
                            className="data-[state=checked]:bg-blue-500"
                        />
                    </div>
                </CardHeader>
                {isEnabled("orch_data.enabled") && (
                    <CardContent className="space-y-3 pt-0">
                        <ConfigRow label={copy("Cycle principal")} unit="s" configKey="orch_data.sleep_interval_s" value={cfg} onSave={save} />
                        <ConfigRow label={copy("Discovery + Cotes (toutes les N iter.)")} configKey="orch_data.discovery_every_n" value={cfg} onSave={save} />
                        <ConfigRow label={copy("Cleanup/Stats (toutes les N iter.)")} configKey="orch_data.cleanup_every_n" value={cfg} onSave={save} />
                        <ConfigRow label={copy("Fenetre Discovery")} unit="j" configKey="orch_data.discovery_days" value={cfg} onSave={save} />
                    </CardContent>
                )}
            </Card>

            {/* ============================================ */}
            {/* ORCHESTRATOR AI */}
            {/* ============================================ */}
            <Card className={cn(
                "bg-black/40 border-purple-500/20 backdrop-blur-sm transition-all",
                !isEnabled("orch_ai.enabled") && "opacity-50"
            )}>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <CardTitle className="text-white flex items-center gap-2 text-base">
                                <Brain className="size-4 text-purple-500" />
                                Orchestrator AI
                            </CardTitle>
                            <CardDescription className="text-neutral-400 text-xs">
                                {copy("Analyses IA multi-frequence. Planning UTC configurable.")}
                            </CardDescription>
                        </div>
                        <Switch
                            checked={isEnabled("orch_ai.enabled")}
                            onCheckedChange={(v) => save("orch_ai.enabled", v ? "true" : "false")}
                            className="data-[state=checked]:bg-purple-500"
                        />
                    </div>
                </CardHeader>
                {isEnabled("orch_ai.enabled") && (
                    <CardContent className="space-y-5 pt-0">

                        {/* Global AI settings */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            <ConfigRow label={copy("Check interval")} unit="s" configKey="orch_ai.check_interval_s" value={cfg} onSave={save} />
                            <ConfigRow label={copy("Tolerance")} unit="min" configKey="orch_ai.tolerance_min" value={cfg} onSave={save} />
                            <ConfigRow label={copy("Scan window")} unit="j" configKey="orch_ai.scan_days" value={cfg} onSave={save} />
                            <ConfigRow label={copy("Pause audits")} unit="s" configKey="orch_ai.audit_pause_s" value={cfg} onSave={save} />
                        </div>

                        {/* Schedule UTC */}
                        <div>
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 mb-2 block">
                                <Clock className="size-3 inline mr-1" />{copy("Planning UTC")}
                            </Label>
                            <div className="grid grid-cols-4 gap-3">
                                {[1, 2, 3, 4].map((n) => (
                                    <div key={n} className="flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/5">
                                        <span className="text-[10px] text-neutral-400 font-mono whitespace-nowrap">{copy("Run")} {n}</span>
                                        <Input
                                            type="number"
                                            min={0} max={23}
                                            className="h-7 w-14 bg-black/50 border-white/10 text-xs font-mono text-center p-0"
                                            value={cfg[`orch_ai.run${n}_hour`]}
                                            onChange={(e) => setCfg((p) => ({ ...p, [`orch_ai.run${n}_hour`]: e.target.value }))}
                                            onBlur={(e) => save(`orch_ai.run${n}_hour`, e.target.value)}
                                        />
                                        <span className="text-[10px] text-neutral-600">h</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Per-sport config */}
                        <div className="space-y-3">
                            <Label className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 block">
                                <Cpu className="size-3 inline mr-1" />{copy("Configuration par sport")}
                            </Label>

                            {SPORTS.map((sport) => {
                                const prefix = `orch_ai.${sport.key}`;
                                const enabled = isEnabled(`${prefix}.enabled`);

                                return (
                                    <div
                                        key={sport.key}
                                        className={cn(
                                            "p-4 rounded-xl border transition-all",
                                            enabled
                                                ? "bg-white/5 border-white/10 hover:border-purple-500/30"
                                                : "bg-white/[0.02] border-white/5 opacity-50"
                                        )}
                                    >
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-3">
                                                <div className="size-8 rounded-lg bg-black border border-white/10 flex items-center justify-center text-neutral-400">
                                                    <sport.icon size={16} />
                                                </div>
                                                <span className="text-sm font-bold text-neutral-300">{sport.label}</span>
                                            </div>
                                            <Switch
                                                checked={enabled}
                                                onCheckedChange={(v) => save(`${prefix}.enabled`, v ? "true" : "false")}
                                                className="data-[state=checked]:bg-purple-500"
                                            />
                                        </div>

                                        {enabled && (
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                {/* Runs per day */}
                                                <div className="flex items-center justify-between p-2 rounded-lg bg-black/30 border border-white/5">
                                                    <span className="text-[10px] text-neutral-400">{copy("Runs/jour")}</span>
                                                    <Input
                                                        type="number"
                                                        min={1} max={6}
                                                        className="h-7 w-14 bg-black/50 border-white/10 text-xs font-mono text-center p-0"
                                                        value={cfg[`${prefix}.runs_per_day`]}
                                                        onChange={(e) => setCfg((p) => ({ ...p, [`${prefix}.runs_per_day`]: e.target.value }))}
                                                        onBlur={(e) => save(`${prefix}.runs_per_day`, e.target.value)}
                                                    />
                                                </div>

                                                {/* Provider */}
                                                <div className="flex items-center justify-between p-2 rounded-lg bg-black/30 border border-white/5">
                                                    <span className="text-[10px] text-neutral-400">{copy("Provider")}</span>
                                                    <Select
                                                        value={cfg[`${prefix}.provider`]}
                                                        onValueChange={(v) => save(`${prefix}.provider`, v)}
                                                    >
                                                        <SelectTrigger className="h-7 w-28 bg-black/50 border-white/10 text-[10px] font-mono">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {AI_PROVIDERS.map((p) => (
                                                                <SelectItem key={p.value} value={p.value} className="text-xs">{p.label}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>

                                                {/* Model */}
                                                <div className="flex items-center justify-between p-2 rounded-lg bg-black/30 border border-white/5">
                                                    <span className="text-[10px] text-neutral-400">{copy("Model")}</span>
                                                    <Select
                                                        value={cfg[`${prefix}.model`]}
                                                        onValueChange={(v) => save(`${prefix}.model`, v)}
                                                    >
                                                        <SelectTrigger className="h-7 w-36 bg-black/50 border-white/10 text-[10px] font-mono">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {AI_MODELS.map((m) => (
                                                                <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </CardContent>
                )}
            </Card>
        </div>
    );
}

/** Petit composant reutilisable pour une ligne de config numerique. */
function ConfigRow({
    label,
    unit,
    configKey,
    value,
    onSave,
}: {
    label: string;
    unit?: string;
    configKey: string;
    value: ConfigMap;
    onSave: (key: string, val: string) => void;
}) {
    const [local, setLocal] = useState(value[configKey] || "");

    useEffect(() => { setLocal(value[configKey] || ""); }, [value[configKey]]);

    return (
        <div className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5 hover:border-white/10 transition-all">
            <span className="text-[10px] text-neutral-400">{label}</span>
            <div className="flex items-center gap-1">
                <Input
                    type="number"
                    className="h-7 w-16 bg-black/50 border-white/10 text-xs font-mono text-center p-0 focus:border-purple-500/50"
                    value={local}
                    onChange={(e) => setLocal(e.target.value)}
                    onBlur={() => onSave(configKey, local)}
                />
                {unit && <span className="text-[10px] text-neutral-600 font-mono w-6">{unit}</span>}
            </div>
        </div>
    );
}
