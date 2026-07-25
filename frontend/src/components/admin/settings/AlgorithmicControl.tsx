"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Zap, Clock, Activity, Save, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/use-i18n";

interface SystemConfig {
    key: string;
    value: string;
    description: string;
}

export function AlgorithmicControl() {
    const { copy } = useI18n();
    // Default values
    const defaults = {
        schedule_live_interval: "300",
        active_schedule_live: "true",
        imminent_check_interval: "600",
        active_manage_imminent: "true",
        daily_ingestion_hour: "3",
        daily_ingestion_days_ahead: "7",
        daily_ingestion_last_run: "",
        active_daily_ingestion: "true",
    };

    const [configs, setConfigs] = useState<Record<string, string>>(defaults);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const supabase = createClient();

    useEffect(() => {
        fetchConfigs();

        // Realtime subscription
        const channel = supabase
            .channel('system_config_changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'system_config'
                },
                (payload) => {
                    // Update state with the new value
                    const newRecord = payload.new as SystemConfig;
                    if (newRecord && newRecord.key) {
                        setConfigs(current => ({
                            ...current,
                            [newRecord.key]: newRecord.value
                        }));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchConfigs = async () => {
        try {
            const { data, error } = await supabase
                .from('system_config')
                .select('*');

            if (error) throw error;

            const configMap: Record<string, string> = { ...defaults };
            data?.forEach((c: SystemConfig) => {
                configMap[c.key] = c.value;
            });
            setConfigs(configMap);
        } catch (error) {
            console.error("Failed to fetch configs:", error);
            toast.error(copy("Erreur lors du chargement de la configuration système."));
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (key: string, value: string) => {
        setSaving(true);
        try {
            // We use the python API usually but for now direct supabase update is cleaner if RLS allows
            // Wait, we set RLS to allow "authenticated" update in the migration.
            const { error } = await supabase
                .from('system_config')
                .upsert({
                    key,
                    value: value.toString(),
                    updated_at: new Date().toISOString()
                });

            if (error) throw error;

            setConfigs(prev => ({ ...prev, [key]: value }));
            toast.success(copy("Configuration mise à jour avec succès !"));
        } catch (error: any) {
            console.error("Failed to update config:", error);
            toast.error(`${copy("Erreur lors de la sauvegarde")}: ${error.message || error.code || copy("Inconnue")}`);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="h-48 animate-pulse bg-white/5 rounded-xl" />;

    const getStatusColor = (lastHeartbeat: string, intervalSeconds: number) => {
        if (!lastHeartbeat) return "bg-neutral-500";
        const heartbeatDate = new Date(lastHeartbeat);
        const now = new Date();
        const diffSeconds = (now.getTime() - heartbeatDate.getTime()) / 1000;

        // Allow 2.5x grace period
        return diffSeconds < (intervalSeconds * 2.5) ? "bg-emerald-500 animate-pulse" : "bg-red-500";
    };

    return (
        <Card className="bg-black/40 border-purple-500/20 backdrop-blur-sm h-full">
            <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <CardTitle className="text-white flex items-center gap-2 text-base">
                            <Activity className="size-4 text-purple-500" />
                            {copy("Contrôle Algorithmique")}
                        </CardTitle>
                        <CardDescription className="text-neutral-400 text-xs">
                            {copy("Paramètres globaux du système.")}
                        </CardDescription>
                    </div>
                    <Badge variant="outline" className="border-purple-500/30 text-purple-400 bg-purple-500/5 text-[10px]">
                        ACTIVE
                    </Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">

                {/* 1. Live Update Frequency */}
                <div className={`group flex items-center justify-between p-3 rounded-lg border transition-all ${configs.active_schedule_live === 'true' ? 'bg-white/5 border-white/5 hover:border-purple-500/30' : 'bg-white/0 border-white/5 opacity-60'}`}>
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <div className={`size-2 rounded-full ${getStatusColor(configs.heartbeat_schedule_live, parseInt(configs.schedule_live_interval))}`} />
                            <Label className="text-white flex items-center gap-2 text-xs font-medium">
                                <Zap className="size-3.5 text-amber-400" />
                                Live Refresh Rate
                            </Label>
                        </div>
                        <p className="text-[10px] text-neutral-500 pl-4">
                            {copy("Fréquence de mise à jour des scores (en secondes).")}
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <Input
                                type="number"
                                disabled={configs.active_schedule_live !== 'true'}
                                className="h-8 w-20 bg-black/50 border-white/10 text-xs font-mono text-right focus:border-purple-500/50 disabled:opacity-50"
                                value={configs.schedule_live_interval}
                                onChange={(e) => setConfigs(prev => ({ ...prev, schedule_live_interval: e.target.value }))}
                                onBlur={(e) => handleSave("schedule_live_interval", e.target.value)}
                            />
                            <span className="text-[10px] text-neutral-600 font-mono w-4">s</span>
                        </div>
                        <Switch
                            checked={configs.active_schedule_live === 'true'}
                            onCheckedChange={(checked) => handleSave("active_schedule_live", checked ? "true" : "false")}
                        />
                    </div>
                </div>

                {/* 2. Imminent Status Frequency */}
                <div className={`group flex items-center justify-between p-3 rounded-lg border transition-all ${configs.active_manage_imminent === 'true' ? 'bg-white/5 border-white/5 hover:border-blue-500/30' : 'bg-white/0 border-white/5 opacity-60'}`}>
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <div className={`size-2 rounded-full ${getStatusColor(configs.heartbeat_manage_imminent, parseInt(configs.imminent_check_interval))}`} />
                            <Label className="text-white flex items-center gap-2 text-xs font-medium">
                                <Clock className="size-3.5 text-blue-400" />
                                Imminent Check
                            </Label>
                        </div>
                        <p className="text-[10px] text-neutral-500 pl-4">
                            {copy("Détection des matchs à venir (< 3h).")}
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <Input
                                type="number"
                                disabled={configs.active_manage_imminent !== 'true'}
                                className="h-8 w-20 bg-black/50 border-white/10 text-xs font-mono text-right focus:border-blue-500/50 disabled:opacity-50"
                                value={configs.imminent_check_interval}
                                onChange={(e) => setConfigs(prev => ({ ...prev, imminent_check_interval: e.target.value }))}
                                onBlur={(e) => handleSave("imminent_check_interval", e.target.value)}
                            />
                            <span className="text-[10px] text-neutral-600 font-mono w-4">s</span>
                        </div>
                        <Switch
                            checked={configs.active_manage_imminent === 'true'}
                            onCheckedChange={(checked) => handleSave("active_manage_imminent", checked ? "true" : "false")}
                        />
                    </div>
                </div>

                <div className="h-px bg-white/5" />

                {/* 3. Daily Ingestion */}
                <div className={`space-y-3 p-3 rounded-lg border transition-all ${configs.active_daily_ingestion === 'true' ? 'bg-white/0 border-transparent' : 'bg-white/0 border-white/5 opacity-60'}`}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            {/* Daily is special: it runs once a day, so we check if last run was < 25h or heartbeat < 1h */}
                            <div className={`size-2 rounded-full ${getStatusColor(configs.heartbeat_daily_ingestion, 3600)}`} />
                            <Label className="text-white flex items-center gap-2 text-xs font-medium">
                                <RotateCcw className="size-3.5 text-emerald-400" />
                                Ingestion Quotidienne
                            </Label>
                        </div>
                        <div className="flex items-center gap-4">
                            <span className="text-[10px] text-neutral-500 font-mono">
                                Last Run: {configs.daily_ingestion_last_run || "Never"}
                            </span>
                            <Switch
                                checked={configs.active_daily_ingestion === 'true'}
                                onCheckedChange={(checked) => handleSave("active_daily_ingestion", checked ? "true" : "false")}
                            />
                        </div>
                    </div>

                    {configs.active_daily_ingestion === 'true' && (
                        <div className="grid grid-cols-2 gap-3 pl-4">
                            {/* Hour */}
                            <div className="group flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5 hover:border-emerald-500/30 transition-all">
                                <span className="text-[10px] text-neutral-400">{copy("Heure (0-23h)")}</span>
                                <div className="flex items-center gap-1">
                                    <Input
                                        type="number"
                                        min={0} max={23}
                                        className="h-7 w-12 bg-black/50 border-white/10 text-xs font-mono text-center focus:border-emerald-500/50 p-0"
                                        value={configs.daily_ingestion_hour}
                                        onChange={(e) => setConfigs(prev => ({ ...prev, daily_ingestion_hour: e.target.value }))}
                                        onBlur={(e) => handleSave("daily_ingestion_hour", e.target.value)}
                                    />
                                    <span className="text-[10px] text-neutral-600">h</span>
                                </div>
                            </div>

                            {/* Days Ahead */}
                            <div className="group flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/5 hover:border-emerald-500/30 transition-all">
                                <span className="text-[10px] text-neutral-400">{copy("Jours (Futures)")}</span>
                                <div className="flex items-center gap-1">
                                    <Input
                                        type="number"
                                        min={1} max={30}
                                        className="h-7 w-12 bg-black/50 border-white/10 text-xs font-mono text-center focus:border-emerald-500/50 p-0"
                                        value={configs.daily_ingestion_days_ahead}
                                        onChange={(e) => setConfigs(prev => ({ ...prev, daily_ingestion_days_ahead: e.target.value }))}
                                        onBlur={(e) => handleSave("daily_ingestion_days_ahead", e.target.value)}
                                    />
                                    <span className="text-[10px] text-neutral-600">j</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

            </CardContent>
        </Card>
    );
}
