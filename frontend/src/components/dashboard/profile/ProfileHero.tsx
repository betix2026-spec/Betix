"use client";


import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Settings, Shield, Star, Trophy, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import { ProfileEditDialog } from "./ProfileEditDialog";
import { UserProfile, Badge as UserBadge } from "@/types/user";
import { useI18n } from "@/lib/use-i18n";

interface ProfileHeroProps {
    profile: UserProfile;
}

export function ProfileHero({ profile }: ProfileHeroProps) {
    const { copy } = useI18n();
    // Rank Configuration
    const rankConfig = {
        Rookie: { color: "text-neutral-400", bg: "bg-neutral-500", border: "border-neutral-500", icon: Shield },
        Pro: { color: "text-blue-400", bg: "bg-blue-500", border: "border-blue-500", icon: Star },
        Elite: { color: "text-purple-400", bg: "bg-purple-500", border: "border-purple-500", icon: Trophy },
        Legend: { color: "text-amber-400", bg: "bg-amber-500", border: "border-amber-500", icon: Crown },
    }[profile.rank as "Rookie" | "Pro" | "Elite" | "Legend"] || { color: "text-neutral-400", bg: "bg-neutral-500", border: "border-neutral-500", icon: Shield };

    const RankIcon = rankConfig.icon;
    const progressPercent = (profile.xp / profile.nextLevelXp) * 100;

    return (
        <div className="relative group perspective-1000">
            {/* The Holographic Card */}
            <div className="relative overflow-hidden rounded-[2.5rem] bg-black border border-white/10 shadow-2xl transition-transform duration-500 hover:scale-[1.01] hover:rotate-1">

                {/* Dynamic Background */}
                <div className={cn("absolute inset-0 opacity-10 bg-gradient-to-br from-black via-black to-white/10", rankConfig.bg)} />
                <div className="absolute top-[-50%] left-[-20%] w-[80%] h-[100%] bg-white/[0.03] blur-[100px] z-0 animate-pulse-slow" />

                <div className="relative z-10 p-8 sm:p-10 flex flex-col sm:flex-row items-center gap-8 sm:gap-12">

                    {/* Avatar Section */}
                    <div className="relative shrink-0">
                        <div className={cn("absolute inset-0 rounded-full blur-2xl opacity-40", rankConfig.bg)} />
                        <div className={cn("relative size-28 sm:size-36 rounded-full flex items-center justify-center border-[3px] shadow-2xl bg-black overflow-hidden", rankConfig.border)}>
                            {profile.avatar && (profile.avatar.startsWith('http') || profile.avatar.startsWith('/')) ? (
                                <img
                                    src={profile.avatar}
                                    alt={profile.username}
                                    className="size-full object-cover"
                                />
                            ) : (
                                <span className={cn("text-3xl sm:text-5xl font-black tracking-tighter", rankConfig.color)}>
                                    {profile.avatar || profile.username.charAt(0).toUpperCase()}
                                </span>
                            )}

                            {/* Rank Badge Floating */}
                            <div className={cn("absolute -bottom-2 -right-2 size-10 rounded-full flex items-center justify-center border-2 border-black z-10", rankConfig.bg)}>
                                <RankIcon className="size-5 text-black fill-current" />
                            </div>
                        </div>
                    </div>

                    {/* Info Section */}
                    <div className="flex-1 text-center sm:text-left space-y-4 w-full">
                        <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-4">
                            <div>
                                <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight uppercase">
                                    {profile.username}
                                </h1>
                            </div>
                            <ProfileEditDialog
                                profile={profile}
                                trigger={
                                    <Button variant="outline" className="border-white/10 hover:border-white/20 hover:bg-white/5 text-xs uppercase tracking-widest font-bold rounded-full h-8 px-4">
                                        <Settings className="size-3 mr-2" /> {copy("Éditer")}
                                    </Button>
                                }
                            />
                        </div>

                        {/* XP Progress */}
                        {/* TODO: Restore Level/XP in future version */}
                        {false && (
                            <div className="space-y-2 max-w-md mx-auto sm:mx-0">
                                <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                                    <span className={cn(rankConfig.color)}>{copy("Niveau")} {profile.level}</span>
                                    <span className="text-white/40">{profile.xp} / {profile.nextLevelXp} XP</span>
                                </div>
                                <Progress value={progressPercent} className="h-2 bg-white/5" indicatorClassName={cn(rankConfig.bg)} />
                            </div>
                        )}

                        {/* Recent Badges */}
                        <div className="flex flex-wrap justify-center sm:justify-start gap-2 pt-2">
                            {profile.badges.slice(0, 3).map((badge) => (
                                <Badge key={badge.id} variant="outline" className="bg-white/5 border-white/10 text-neutral-300 py-1.5 px-3 rounded-xl gap-2 hover:bg-white/10 transition-colors cursor-default">
                                    {/* Ideally we'd map icons here, keeping it simple for now */}
                                    <Star className={cn("size-3", badge.rarity === "legendary" ? "text-amber-400 fill-amber-400" : badge.rarity === "epic" ? "text-purple-400" : "text-blue-400")} />
                                    <span className="text-[10px] font-bold uppercase tracking-wider">{badge.name}</span>
                                </Badge>
                            ))}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}
