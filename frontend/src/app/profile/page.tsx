"use client";

import { ProfileHero } from "@/components/dashboard/profile/ProfileHero";
import { StatsCenter } from "@/components/dashboard/profile/StatsCenter";
import { SeasonPass } from "@/components/dashboard/profile/SeasonPass";
import { ControlDeck } from "@/components/dashboard/profile/ControlDeck";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useI18n } from "@/lib/use-i18n";

export default function ProfilePage() {
    const { copy, locale } = useI18n();
    const { isAdmin, isLoading, profile: authProfile } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!isLoading && isAdmin) {
            router.replace(`/${locale}/dashboard`);
        }
    }, [isAdmin, isLoading, locale, router]);

    if (isLoading) return null; // Or a skeleton
    if (isAdmin) return null;

    if (!authProfile) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-4">
                <h2 className="text-xl font-bold text-white">{copy("Profil non trouvé")}</h2>
                <p className="text-neutral-400">{copy("Veuillez vous reconnecter.")}</p>
            </div>
        );
    }

    // MAP Real Data to UI Structure (with EMPTY defaults, not Fake Data)
    const profile: any = {
        id: authProfile.id,
        username: authProfile.username || copy("Utilisateur"),
        avatar: authProfile.avatar_url,
        memberSince: "2026", // Could be fetched from auth metadata if available
        rank: "Rookie", // Default
        level: 1,
        xp: 0,
        nextLevelXp: 100,
        stats: {
            totalBets: 0,
            wins: 0,
            losses: 0,
            winRate: 0,
            roi: 0,
            currentStreak: 0,
            bestStreak: 0,
            totalProfit: 0,
            avgOdds: 0,
        },
        badges: [], // No fake badges
        subscription: {
            plan: {
                name: "Free",
                features: []
            },
            status: "active",
            nextBillingDate: "-",
            price: 0,
        },
        preferences: {
            favoriteSports: authProfile.favorite_sports || [],
            notifications: false,
            newsletter: false,
            theme: "dark",
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-8 pb-20 animate-fade-in text-white/90">
            {/* Header / ID Card */}
            <div className="relative z-10">
                <ProfileHero profile={profile} />
            </div>

            {/* Main Content Grid */}
            <div className="space-y-8 relative z-0">

                {/* 1. Performance Center */}
                {/* TODO: Restore Performance Center in future version */}
                {false && (
                    <section>
                        <div className="flex items-center justify-between mb-4 px-2">
                            <h2 className="text-lg font-black uppercase tracking-widest text-white/50">{copy("Performance Center")}</h2>
                        </div>
                        {/* Only show stats if they exist (which they don't yet, so 0s) */}
                        <StatsCenter stats={profile.stats} />
                    </section>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* 2. Season Pass (Left Col) */}
                    <section className="lg:col-span-2 space-y-4">
                        <h2 className="text-lg font-black uppercase tracking-widest text-white/50 px-2">{copy("Season Pass")}</h2>
                        <SeasonPass subscription={profile.subscription} />
                    </section>

                    {/* 3. Control Deck (Right Col + Full Width below) */}
                    <section className="lg:col-span-3 space-y-4 pt-4">
                        <h2 className="text-lg font-black uppercase tracking-widest text-white/50 px-2">{copy("Control Deck")}</h2>
                        <ControlDeck profile={profile} />
                    </section>
                </div>
            </div>
        </div>
    );
}
