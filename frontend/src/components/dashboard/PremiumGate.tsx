"use client";

import { motion } from "framer-motion";
import { Lock, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/use-i18n";

interface PremiumGateProps {
    children: React.ReactNode;
    isActive: boolean;
    title?: string;
    description?: string;
}

export function PremiumGate({
    children,
    isActive,
    title,
    description
}: PremiumGateProps) {
    const { copy, locale } = useI18n();
    const resolvedTitle = copy(title || "Contenu Premium Verrouillé");
    const resolvedDescription = copy(description || "Débloquez l'accès complet aux analyses de l'IA et aux prédictions avancées avec un abonnement BETIX.");

    if (isActive) {
        return <>{children}</>;
    }

    return (
        <div className="relative group overflow-hidden rounded-xl border border-white/5 bg-zinc-950/20 shadow-2xl">
            {/* Blurred Content Container */}
            <div className="filter blur-md grayscale-[0.5] opacity-30 select-none pointer-events-none transition-all duration-700 group-hover:blur-xl">
                {children}
            </div>

            {/* Overlay Gradient */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-zinc-950/80 to-zinc-950 flex flex-col items-center justify-center p-8 text-center" />

            {/* CTA Content */}
            <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center space-y-6 z-20">
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="p-4 rounded-full bg-primary/10 border border-primary/20 text-primary mb-2"
                >
                    <Lock className="size-8" />
                </motion.div>

                <div className="space-y-2 max-w-sm">
                    <h3 className="text-xl font-black text-white uppercase tracking-tight flex items-center justify-center gap-2">
                        <Sparkles className="size-5 text-primary" />
                        {resolvedTitle}
                    </h3>
                    <p className="text-sm text-neutral-400 font-medium leading-relaxed">
                        {resolvedDescription}
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-4">
                    <Link href={`/${locale}/profile/subscription`}>
                        <Button className="bg-primary hover:bg-primary/90 text-white font-bold h-12 px-8 shadow-[0_0_20px_-5px_rgba(37,99,235,0.5)]">
                            {copy("Devenir Premium")} <ArrowRight className="size-4 ml-2" />
                        </Button>
                    </Link>
                    <Link href={`/${locale}/profile/subscription`}>
                        <Button variant="outline" className="border-white/10 hover:bg-white/5 text-neutral-300 font-bold h-12 px-8">
                            {copy("Voir les plans")}
                        </Button>
                    </Link>
                </div>

                {/* Micro-indicators */}
                <div className="pt-6 flex items-center gap-6">
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] font-black text-primary uppercase">{copy("Confiance")}</span>
                        <span className="text-lg font-bold text-white/40">??%</span>
                    </div>
                    <div className="w-[1px] h-8 bg-white/5" />
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] font-black text-primary uppercase">{copy("Cote IA")}</span>
                        <span className="text-lg font-bold text-white/40">?.??</span>
                    </div>
                    <div className="w-[1px] h-8 bg-white/5" />
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] font-black text-primary uppercase">{copy("Value")}</span>
                        <span className="text-lg font-bold text-white/40">??%</span>
                    </div>
                </div>
            </div>

            {/* Scanlines Effect */}
            <div className="absolute inset-0 pointer-events-none opacity-20 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,118,0.06))] bg-[length:100%_2px,3px_100%]" />
        </div>
    );
}
