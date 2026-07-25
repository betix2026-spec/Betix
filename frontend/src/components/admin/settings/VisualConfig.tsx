"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Paintbrush, Type, Radius, Palette } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/use-i18n";

interface SystemConfig {
    key: string;
    value: string;
    description: string;
}

const FONT_OPTIONS = [
    { value: "inter", label: "Inter" },
    { value: "montserrat", label: "Montserrat" },
    { value: "space-grotesk", label: "Space Grotesk" },
    { value: "dm-sans", label: "DM Sans" },
    { value: "poppins", label: "Poppins" },
    { value: "raleway", label: "Raleway" },
    { value: "outfit", label: "Outfit" },
    { value: "plus-jakarta", label: "Plus Jakarta Sans" },
    { value: "nunito", label: "Nunito" },
];

const ACCENT_PRESETS = [
    { value: "#3b82f6", label: "Blue" },
    { value: "#8b5cf6", label: "Violet" },
    { value: "#06b6d4", label: "Cyan" },
    { value: "#10b981", label: "Emerald" },
    { value: "#f59e0b", label: "Amber" },
    { value: "#ef4444", label: "Red" },
];

export function VisualConfig() {
    const { copy } = useI18n();
    const defaults: Record<string, string> = {
        "ui.font_family": "inter",
        "ui.accent_color": "#3b82f6",
        "ui.border_radius": "12",
        "ui.card_opacity": "40",
    };

    const [configs, setConfigs] = useState<Record<string, string>>(defaults);
    const [loading, setLoading] = useState(true);
    const supabase = createClient();

    useEffect(() => {
        fetchConfigs();

        const channel = supabase
            .channel("visual_config_changes")
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "system_config" },
                (payload) => {
                    const newRecord = payload.new as SystemConfig;
                    if (newRecord?.key?.startsWith("ui.")) {
                        setConfigs((c) => ({ ...c, [newRecord.key]: newRecord.value }));
                    }
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

    const fetchConfigs = async () => {
        try {
            const { data, error } = await supabase
                .from("system_config")
                .select("*")
                .like("key", "ui.%");

            if (error) throw error;

            const map: Record<string, string> = { ...defaults };
            data?.forEach((c: SystemConfig) => { map[c.key] = c.value; });
            setConfigs(map);
        } catch (error) {
            console.error("Failed to fetch visual configs:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (key: string, value: string) => {
        try {
            const { error } = await supabase
                .from("system_config")
                .upsert({ key, value, updated_at: new Date().toISOString() });

            if (error) throw error;
            setConfigs((prev) => ({ ...prev, [key]: value }));
            toast.success("Visual config updated.");
        } catch (error: any) {
            toast.error(`Save error: ${error.message || "Unknown"}`);
        }
    };

    if (loading) return <div className="h-48 animate-pulse bg-white/5 rounded-xl" />;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Typography */}
            <Card className="bg-black/40 border-white/10 backdrop-blur-sm">
                <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <CardTitle className="text-white flex items-center gap-2 text-base">
                                <Type className="size-4 text-pink-500" />
                                {copy("Typography")}
                            </CardTitle>
                            <CardDescription className="text-neutral-400 text-xs">
                                {copy("Police principale de l'application.")}
                            </CardDescription>
                        </div>
                        <Badge variant="outline" className="border-pink-500/30 text-pink-400 bg-pink-500/5 text-[10px]">
                            {copy("GLOBAL")}
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="space-y-5">

                    {/* Font Family */}
                    <div className="space-y-2">
                        <Label className="text-xs text-neutral-400">{copy("Font Family")}</Label>
                        <Select
                            value={configs["ui.font_family"]}
                            onValueChange={(v) => handleSave("ui.font_family", v)}
                        >
                            <SelectTrigger className="bg-black/50 border-white/10 text-white h-9">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-neutral-900 border-white/10">
                                {FONT_OPTIONS.map((f) => (
                                    <SelectItem key={f.value} value={f.value} className="text-white">
                                        {f.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Preview */}
                    <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-2">
                        <p className="text-[10px] uppercase tracking-widest text-neutral-600">{copy("Preview")}</p>
                        <p className="text-lg font-bold text-white">
                            {copy("The quick brown fox")}
                        </p>
                        <p className="text-sm text-neutral-400">
                            {copy("jumps over the lazy dog")} - 0123456789
                        </p>
                    </div>

                </CardContent>
            </Card>

            {/* Theme & Layout */}
            <Card className="bg-black/40 border-white/10 backdrop-blur-sm">
                <CardHeader className="pb-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <CardTitle className="text-white flex items-center gap-2 text-base">
                                <Paintbrush className="size-4 text-cyan-500" />
                                {copy("Theme & Layout")}
                            </CardTitle>
                            <CardDescription className="text-neutral-400 text-xs">
                                {copy("Couleur d'accent et rayon des bordures.")}
                            </CardDescription>
                        </div>
                        <Badge variant="outline" className="border-cyan-500/30 text-cyan-400 bg-cyan-500/5 text-[10px]">
                            {copy("VISUAL")}
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="space-y-5">

                    {/* Accent Color */}
                    <div className="space-y-3">
                        <Label className="text-xs text-neutral-400 flex items-center gap-2">
                            <Palette className="size-3" /> {copy("Accent Color")}
                        </Label>
                        <div className="flex items-center gap-2">
                            {ACCENT_PRESETS.map((preset) => (
                                <button
                                    key={preset.value}
                                    onClick={() => handleSave("ui.accent_color", preset.value)}
                                    className={`size-8 rounded-lg border-2 transition-all hover:scale-110 ${
                                        configs["ui.accent_color"] === preset.value
                                            ? "border-white scale-110 shadow-lg"
                                            : "border-transparent"
                                    }`}
                                    style={{ backgroundColor: preset.value }}
                                    title={preset.label}
                                />
                            ))}
                            <Input
                                type="color"
                                className="size-8 p-0 border-0 bg-transparent cursor-pointer rounded-lg overflow-hidden"
                                value={configs["ui.accent_color"]}
                                onChange={(e) => setConfigs((p) => ({ ...p, "ui.accent_color": e.target.value }))}
                                onBlur={(e) => handleSave("ui.accent_color", e.target.value)}
                                title={copy("Custom color")}
                            />
                        </div>
                    </div>

                    {/* Border Radius */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs text-neutral-400 flex items-center gap-2">
                                <Radius className="size-3" /> {copy("Border Radius")}
                            </Label>
                            <span className="text-xs font-mono text-neutral-500">
                                {configs["ui.border_radius"]}px
                            </span>
                        </div>
                        <Slider
                            min={0}
                            max={24}
                            step={2}
                            value={[parseInt(configs["ui.border_radius"]) || 12]}
                            onValueChange={([v]) => setConfigs((p) => ({ ...p, "ui.border_radius": String(v) }))}
                            onValueCommit={([v]) => handleSave("ui.border_radius", String(v))}
                            className="[&_[role=slider]]:bg-cyan-500"
                        />
                        {/* Radius preview */}
                        <div className="flex items-center gap-3 pt-1">
                            <div
                                className="size-12 bg-white/10 border border-white/20"
                                style={{ borderRadius: `${configs["ui.border_radius"]}px` }}
                            />
                            <div
                                className="h-8 flex-1 bg-white/10 border border-white/20"
                                style={{ borderRadius: `${configs["ui.border_radius"]}px` }}
                            />
                        </div>
                    </div>

                    {/* Card Opacity */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-xs text-neutral-400">{copy("Card Opacity")}</Label>
                            <span className="text-xs font-mono text-neutral-500">
                                {configs["ui.card_opacity"]}%
                            </span>
                        </div>
                        <Slider
                            min={10}
                            max={80}
                            step={5}
                            value={[parseInt(configs["ui.card_opacity"]) || 40]}
                            onValueChange={([v]) => setConfigs((p) => ({ ...p, "ui.card_opacity": String(v) }))}
                            onValueCommit={([v]) => handleSave("ui.card_opacity", String(v))}
                        />
                    </div>

                </CardContent>
            </Card>

        </div>
    );
}
