"use client";

import { useState, useEffect } from "react";
import { Plan, FeatureDefinition } from "@/types/plans";
import { getAdminPlansAction } from "@/app/(admin)/admin/subscriptions/actions";
import { ResourceMonitor } from "@/components/admin/subscriptions/ResourceMonitor";
import { ArsenalGrid } from "@/components/admin/subscriptions/ArsenalGrid";
import { FeatureDefinitionsManager } from "@/components/admin/subscriptions/FeatureDefinitionsManager";
import { EngineeringBay } from "@/components/admin/subscriptions/EngineeringBay";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Plus } from "lucide-react";
import { useI18n } from "@/lib/use-i18n";

export default function AdminSubscriptionsPage() {
    const { copy } = useI18n();
    const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
    const [isEngineeringOpen, setIsEngineeringOpen] = useState(false);
    const [plans, setPlans] = useState<Plan[]>([]);
    const [definitions, setDefinitions] = useState<FeatureDefinition[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchPlans = async () => {
        setIsLoading(true);
        console.log("[AdminSubscriptionsPage] Fetching plans...");
        const result = await getAdminPlansAction();
        console.log("[AdminSubscriptionsPage] fetchPlans result:", result.success, result.data?.length);
        if (result.success && result.data) {
            setPlans(result.data);
            if (result.definitions) {
                setDefinitions(result.definitions);
            }
        }
        setIsLoading(false);
    };

    useEffect(() => {
        fetchPlans();
    }, []);

    // FIX: Sync selectedPlan when plans list updates (e.g. after save)
    useEffect(() => {
        if (selectedPlan && plans.length > 0) {
            const updated = plans.find(p => p.id === selectedPlan.id);
            // Only update if data actually changed to avoid infinite loops (though React state equality check helps)
            if (updated && JSON.stringify(updated) !== JSON.stringify(selectedPlan)) {
                setSelectedPlan(updated);
            }
        }
    }, [plans, selectedPlan]);

    const handleEditPlan = (plan: Plan) => {
        setSelectedPlan(plan);
        setIsEngineeringOpen(true);
    };

    return (
        <div className="space-y-8 animate-fade-in pb-12">

            {/* Command Header */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black uppercase tracking-tight text-white">{copy("Plans d'abonnement")}</h1>
                    <p className="text-sm font-mono text-neutral-500 mt-1">{copy("Gérez vos offres et tarifs")}</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="bg-black border-white/10 hover:bg-white/5 text-neutral-400 gap-2 font-mono text-xs h-9">
                        <ShieldCheck className="size-3.5" /> {copy("Journal d'audit")}
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => { setSelectedPlan(null); setIsEngineeringOpen(true); }}
                        className="bg-amber-500 hover:bg-amber-600 text-black gap-2 font-bold font-mono text-xs h-9"
                    >
                        <Plus className="size-3.5" /> {copy("Nouveau plan")}
                    </Button>
                </div>
            </div>

            {/* 1. Resource Monitor (KPIs) */}
            <section className="space-y-2">
                <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-600 px-2">{copy("Aperçu")}</h2>
                <ResourceMonitor />
            </section>

            {/* 2. Arsenal Grid (Plans) */}
            <section className="space-y-2">
                <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-600 px-2">{copy("Plans")}</h2>
                {isLoading ? (
                    <div className="text-white px-2 py-8 text-center text-sm font-mono animate-pulse border border-white/5 bg-white/5 rounded-2xl">
                        {copy("Chargement des plans...")}
                    </div>
                ) : (
                    <ArsenalGrid
                        plans={plans}
                        definitions={definitions}
                        onEditPlan={handleEditPlan}
                    />
                )}
            </section>

            {/* 3. Feature Definitions Registry */}
            <section className="space-y-2">
                <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-600 px-2">{copy("Fonctionnalités")}</h2>
                <FeatureDefinitionsManager
                    definitions={definitions}
                    onUpdate={fetchPlans}
                />
            </section>

            {/* Side Panel */}
            <EngineeringBay
                plan={selectedPlan}
                definitions={definitions}
                open={isEngineeringOpen}
                onClose={() => setIsEngineeringOpen(false)}
                onSuccess={fetchPlans}
            />

        </div>
    );
}
