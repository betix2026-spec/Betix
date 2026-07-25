"use client";

import { AccessTerminal } from "@/components/auth/AccessTerminal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    ArrowRight,
    BarChart3,
    CheckCircle2,
    Sparkles,
    Target,
    User,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { FootballIcon, BasketballIcon, TennisIcon } from "@/components/icons/SportIcons";
import { useI18n } from "@/lib/use-i18n";

const sportOptions = [
    { id: "football", icon: <FootballIcon size={24} />, name: "Football", color: "border-green-500/20 data-[selected=true]:border-green-500/50 data-[selected=true]:bg-green-500/10" },
    { id: "basketball", icon: <BasketballIcon size={24} />, name: "Basketball", color: "border-orange-500/20 data-[selected=true]:border-orange-500/50 data-[selected=true]:bg-orange-500/10" },
    { id: "tennis", icon: <TennisIcon size={24} />, name: "Tennis", color: "border-yellow-500/20 data-[selected=true]:border-yellow-500/50 data-[selected=true]:bg-yellow-500/10" },
];

export default function OnboardingPage() {
    const { t, copy, locale } = useI18n();
    const [step, setStep] = useState(1);
    const [selectedSports, setSelectedSports] = useState<string[]>(["football"]);
    const [profileType, setProfileType] = useState("casual");
    const profileTypes = [
        { id: "casual", icon: <Sparkles className="size-5" />, name: t("beginnerProfile"), desc: t("beginnerProfileDescription") },
        { id: "regular", icon: <BarChart3 className="size-5" />, name: t("regularProfile"), desc: t("regularProfileDescription") },
        { id: "pro", icon: <Target className="size-5" />, name: t("analyticalProfile"), desc: t("analyticalProfileDescription") },
    ];

    const toggleSport = (id: string) => {
        setSelectedSports((prev) =>
            prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
        );
    };

    return (
        <AccessTerminal type="onboarding">

            {/* Stepper */}
            <div className="flex items-center gap-2 mb-8">
                {[1, 2, 3].map((s) => (
                    <div key={s} className="flex items-center gap-2 flex-1">
                        <div
                            className={`size-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all ${s === step
                                ? "bg-blue-600 text-white shadow-[0_0_10px_rgba(37,99,235,0.5)]"
                                : s < step
                                    ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                                    : "bg-white/5 text-neutral-500 border border-white/5"
                                }`}
                        >
                            {s < step ? <CheckCircle2 className="size-4" /> : s}
                        </div>
                        {s < 3 && (
                            <div className={`h-[2px] flex-1 rounded-full transition-colors ${s < step ? "bg-blue-500/50" : "bg-white/10"}`} />
                        )}
                    </div>
                ))}
            </div>

            {/* Step 1: Sports */}
            {step === 1 && (
                <div className="space-y-5 animate-fade-in">
                    <div>
                        <h2 className="text-xl font-bold mb-1 text-white">{t("onboardingSportsTitle")}</h2>
                        <p className="text-sm text-neutral-400">
                            {t("onboardingSportsSubtitle")}
                        </p>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                        {sportOptions.map((sport) => (
                            <button
                                key={sport.id}
                                type="button"
                                onClick={() => toggleSport(sport.id)}
                                data-selected={selectedSports.includes(sport.id)}
                                className={`p-4 rounded-lg border-2 text-left flex items-center gap-4 transition-all hover:bg-white/5 ${selectedSports.includes(sport.id)
                                        ? "border-blue-500/50 bg-blue-500/10"
                                        : "border-white/10 text-neutral-400"
                                    }`}
                            >
                                <div className={selectedSports.includes(sport.id) ? "text-white" : "text-neutral-500"}>{sport.icon}</div>
                                <span className={`font-medium text-sm ${selectedSports.includes(sport.id) ? "text-white" : ""}`}>{sport.name}</span>
                                {selectedSports.includes(sport.id) && (
                                    <CheckCircle2 className="size-4 text-blue-500 ml-auto" />
                                )}
                            </button>
                        ))}
                    </div>
                    <Button
                        onClick={() => setStep(2)}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold h-12 uppercase tracking-wide gap-2 shadow-[0_0_20px_-5px_rgba(37,99,235,0.5)]"
                        disabled={selectedSports.length === 0}
                    >
                        {t("onboardingContinueButton")} <ArrowRight className="size-4" />
                    </Button>
                </div>
            )}

            {/* Step 2: Profile */}
            {step === 2 && (
                <div className="space-y-5 animate-fade-in">
                    <div>
                        <h2 className="text-xl font-bold mb-1 text-white">{t("onboardingProfileTitle")}</h2>
                        <p className="text-sm text-neutral-400">
                            {t("onboardingProfileSubtitle")}
                        </p>
                    </div>
                    <div className="space-y-3">
                        {profileTypes.map((p) => (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => setProfileType(p.id)}
                                className={`w-full p-4 rounded-lg border-2 text-left flex items-start gap-4 transition-all hover:bg-white/5 ${profileType === p.id
                                    ? "border-blue-500/50 bg-blue-500/10"
                                    : "border-white/10"
                                    }`}
                            >
                                <div className={`mt-0.5 ${profileType === p.id ? "text-blue-400" : "text-neutral-500"}`}>
                                    {p.icon}
                                </div>
                                <div className="flex-1">
                                    <p className={`font-medium text-sm ${profileType === p.id ? "text-white" : "text-neutral-300"}`}>{p.name}</p>
                                    <p className="text-xs text-neutral-500 mt-0.5">{p.desc}</p>
                                </div>
                                {profileType === p.id && (
                                    <CheckCircle2 className="size-4 text-blue-500 mt-0.5" />
                                )}
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-3">
                        <Button variant="outline" onClick={() => setStep(1)} className="flex-1 border-white/10 text-neutral-400 hover:text-white hover:bg-white/5 h-12">
                            {t("onboardingBackButton")}
                        </Button>
                        <Button
                            onClick={() => setStep(3)}
                            className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold h-12 uppercase tracking-wide gap-2 shadow-[0_0_20px_-5px_rgba(37,99,235,0.5)]"
                        >
                            {t("onboardingContinueButton")} <ArrowRight className="size-4" />
                        </Button>
                    </div>
                </div>
            )}

            {/* Step 3: Summary */}
            {step === 3 && (
                <div className="space-y-5 animate-fade-in">
                    <div>
                        <h2 className="text-xl font-bold mb-1 text-white">{t("onboardingSummaryTitle")}</h2>
                        <p className="text-sm text-neutral-400">
                            {t("onboardingSummarySubtitle")}
                        </p>
                    </div>

                    <Card className="bg-black/40 border-white/10 overflow-hidden">
                        <CardContent className="p-5 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="size-12 rounded-lg bg-blue-500/20 border border-blue-500/50 flex items-center justify-center text-blue-400 font-bold">
                                    <User className="size-6" />
                                </div>
                                <div>
                                    <p className="font-bold text-white uppercase tracking-wide">{t("onboardingSetupComplete")}</p>
                                    <p className="text-xs text-neutral-500 font-mono">{t("onboardingProfileLabel")}: {profileTypes.find(p => p.id === profileType)?.name}</p>
                                </div>
                            </div>
                            <div>
                                <p className="text-[10px] uppercase font-bold text-neutral-600 mb-2 tracking-widest">{t("onboardingSportsLabel")}</p>
                                <div className="flex gap-2">
                                    {selectedSports.map((s) => {
                                        const sport = sportOptions.find(o => o.id === s);
                                        return (
                                            <Badge key={s} variant="outline" className="gap-1.5 text-xs py-1 border-white/10 text-neutral-300 bg-white/5">
                                                {sport?.icon && <span className="scale-75">{sport.icon}</span>}
                                                {sport?.name}
                                            </Badge>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="flex gap-2 pt-2 border-t border-white/5">
                                <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/20 bg-emerald-500/5">{copy("2 analyses/day")}</Badge>
                                <Badge variant="outline" className="text-[10px] text-blue-400 border-blue-500/20 bg-blue-500/5">{t("onboardingFreeBadge")}</Badge>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex gap-3">
                        <Button variant="outline" onClick={() => setStep(2)} className="flex-1 border-white/10 text-neutral-400 hover:text-white hover:bg-white/5 h-12">
                            {t("onboardingEditButton")}
                        </Button>
                        <Link href={`/${locale}/dashboard`} className="flex-1">
                            <Button className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold h-12 uppercase tracking-wide gap-2 shadow-[0_0_20px_-5px_rgba(16,185,129,0.5)]">
                                {t("onboardingEnterButton")}
                                <ArrowRight className="size-4" />
                            </Button>
                        </Link>
                    </div>
                </div>
            )}
        </AccessTerminal>
    );
}
