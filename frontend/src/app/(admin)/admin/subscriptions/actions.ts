'use server';

import { supabaseAdmin } from "@/lib/supabase-admin";
import { Plan, PlanFeatures, PlanPromo, FeatureDefinition } from "@/types/plans"; // Use new types
import { copy } from "@/lib/i18n";
import { getServerLocale } from "@/lib/i18n-server";
import { revalidatePath } from "next/cache";

export async function getAdminPlansAction(): Promise<{ success: boolean; data?: Plan[]; definitions?: FeatureDefinition[]; error?: string }> {
    try {
        console.log("[Admin Action] Fetching plans...");

        // 1. Fetch Plans
        const { data: plans, error: plansError } = await supabaseAdmin
            .from('plans')
            .select('*')
        if (plansError) throw new Error(`Plans fetch failed: ${plansError.message}`);

        // 2. Fetch Definitions
        const { data: definitions, error: defsError } = await supabaseAdmin
            .from('feature_definitions')
            .select('*');

        if (defsError) throw new Error(`Definitions fetch failed: ${defsError.message}`);

        // 3. Cast to Plan type (Supabase returns loose types, we assume schema matches)
        // We might want to ensure 'features' is correct shape if data was dirty, but migration fixed it.
        const mappedPlans: Plan[] = plans.map(p => ({
            ...p,
            // Ensure promo is effectively PlanPromo or null
            promo: p.promo as PlanPromo | null
        }));

        // Sort Plans: Free -> Daily -> Weekly -> Monthly -> Yearly
        const sortWeights: Record<string, number> = {
            'free': 0, 'gratuit': 0,
            'daily': 1, 'jour': 1,
            'weekly': 2, 'hebdo': 2,
            'monthly': 3, 'mensuel': 3, 'month': 3,
            'yearly': 4, 'annuel': 4, 'year': 4
        };

        mappedPlans.sort((a, b) => {
            const wA = sortWeights[a.frequency?.toLowerCase() || ''] ?? 99;
            const wB = sortWeights[b.frequency?.toLowerCase() || ''] ?? 99;
            return wA - wB;
        });

        return { success: true, data: mappedPlans, definitions: definitions as FeatureDefinition[] };

    } catch (error: any) {
        console.error("[Admin Action] Error:", error);
        return { success: false, error: error.message };
    }
}

export interface UpdatePlanData {
    name?: string;
    name_en?: string | null;
    name_es?: string | null;
    name_de?: string | null;
    description?: string;
    description_en?: string | null;
    description_es?: string | null;
    description_de?: string | null;
    price?: number;
    frequency?: string;
    features?: PlanFeatures; // Full JSONB structure
    promo?: PlanPromo | null;
    trial_price?: number | null;
    trial_days?: number | null;
    strikethrough_price?: number | null;
    is_active?: boolean;
    position?: number;
    badge_text?: string | null;
    badge_text_en?: string | null;
    badge_text_es?: string | null;
    badge_text_de?: string | null;
    badge_color?: string | null;
}

export async function updatePlanAction(planId: string, data: UpdatePlanData) {
    console.log(`[Admin Action] Updating plan ${planId}`, data);
    try {
        // Clean undefined values
        const updates: any = {};
        if (data.name !== undefined) updates.name = data.name;
        if (data.name_en !== undefined) updates.name_en = data.name_en;
        if (data.name_es !== undefined) updates.name_es = data.name_es;
        if (data.name_de !== undefined) updates.name_de = data.name_de;
        if (data.description !== undefined) updates.description = data.description;
        if (data.description_en !== undefined) updates.description_en = data.description_en;
        if (data.description_es !== undefined) updates.description_es = data.description_es;
        if (data.description_de !== undefined) updates.description_de = data.description_de;
        if (data.price !== undefined) updates.price = data.price;
        if (data.frequency !== undefined) updates.frequency = data.frequency;
        if (data.features !== undefined) updates.features = data.features;
        if (data.promo !== undefined) updates.promo = data.promo;
        if (data.trial_price !== undefined) updates.trial_price = data.trial_price;
        if (data.trial_days !== undefined) updates.trial_days = data.trial_days;
        if (data.strikethrough_price !== undefined) updates.strikethrough_price = data.strikethrough_price;
        if (data.is_active !== undefined) updates.is_active = data.is_active;
        if (data.position !== undefined) updates.position = data.position;
        if (data.badge_text !== undefined) updates.badge_text = data.badge_text;
        if (data.badge_text_en !== undefined) updates.badge_text_en = data.badge_text_en;
        if (data.badge_text_es !== undefined) updates.badge_text_es = data.badge_text_es;
        if (data.badge_text_de !== undefined) updates.badge_text_de = data.badge_text_de;
        if (data.badge_color !== undefined) updates.badge_color = data.badge_color;

        const { error } = await supabaseAdmin
            .from('plans')
            .update(updates)
            .eq('id', planId);

        if (error) throw new Error(`Plan update failed: ${error.message}`);

        revalidatePath('/admin/subscriptions');
        revalidatePath('/pricing'); // Revalidate public pages too
        revalidatePath('/profile/subscription'); // And dashboard

        return { success: true };
    } catch (error: any) {
        console.error("[Admin Action] Update Error:", error);
        return { success: false, error: error.message };
    }
}

export async function createPlanAction(data: UpdatePlanData) {
    console.log("[Admin Action] Creating new plan", data);
    try {
        // Validation (Basic)
        if (!data.name || data.price === undefined || !data.frequency) {
            return { success: false, error: "Missing mandatory fields: Name, Price, Frequency" };
        }

        // Get max position to append to end
        const { data: maxPosData } = await supabaseAdmin
            .from('plans')
            .select('position')
            .order('position', { ascending: false })
            .limit(1)
            .single();

        const nextPosition = (maxPosData?.position ?? 0) + 1;

        const { data: newPlan, error } = await supabaseAdmin
            .from('plans')
            .insert({
                name: data.name,
                name_en: data.name_en ?? null,
                name_es: data.name_es ?? null,
                name_de: data.name_de ?? null,
                description: data.description,
                description_en: data.description_en ?? null,
                description_es: data.description_es ?? null,
                description_de: data.description_de ?? null,
                price: data.price,
                frequency: data.frequency,
                features: data.features || { core: {}, advanced: {}, vip: {} }, // Default empty structure
                is_active: false, // Always inactive by default
                position: nextPosition,
                promo: data.promo,
                trial_price: data.trial_price ?? null,
                trial_days: data.trial_days ?? null,
                strikethrough_price: data.strikethrough_price ?? null,
                badge_text: data.badge_text ?? null,
                badge_text_en: data.badge_text_en ?? null,
                badge_text_es: data.badge_text_es ?? null,
                badge_text_de: data.badge_text_de ?? null,
                badge_color: data.badge_color ?? null
            })
            .select()
            .single();

        if (error) throw new Error(`Plan creation failed: ${error.message}`);

        revalidatePath('/pricing');
        revalidatePath('/profile/subscription');
        revalidatePath('/admin/subscriptions');

        return { success: true, data: newPlan };
    } catch (error: any) {
        console.error("[Admin Action] Create Error:", error);
        return { success: false, error: error.message };
    }
}

// =========================================================================
// Feature Definitions CRUD
// =========================================================================

export async function createFeatureDefinitionAction(data: {
    id: string;
    label: string;
    label_en?: string | null;
    label_es?: string | null;
    label_de?: string | null;
    description?: string;
    description_en?: string | null;
    description_es?: string | null;
    description_de?: string | null;
    type: 'text' | 'boolean' | 'number';
}) {
    console.log("[Admin Action] Creating feature definition:", data.id);
    try {
        if (!data.id || !data.label || !data.type) {
            return { success: false, error: "Champs obligatoires : ID, Label, Type" };
        }

        // Sanitize ID: lowercase, underscores only
        const cleanId = data.id.toLowerCase().replace(/[^a-z0-9_]/g, '_');

        const { error } = await supabaseAdmin
            .from('feature_definitions')
            .insert({
                id: cleanId,
                label: data.label,
                label_en: data.label_en ?? null,
                label_es: data.label_es ?? null,
                label_de: data.label_de ?? null,
                description: data.description || null,
                description_en: data.description_en ?? null,
                description_es: data.description_es ?? null,
                description_de: data.description_de ?? null,
                type: data.type,
            });

        if (error) throw new Error(`Feature creation failed: ${error.message}`);

        revalidatePath('/admin/subscriptions');
        return { success: true };
    } catch (error: any) {
        console.error("[Admin Action] Create Feature Error:", error);
        return { success: false, error: error.message };
    }
}

export async function updateFeatureDefinitionAction(
    id: string,
    data: {
        label?: string;
        label_en?: string | null;
        label_es?: string | null;
        label_de?: string | null;
        description?: string;
        description_en?: string | null;
        description_es?: string | null;
        description_de?: string | null;
        type?: 'text' | 'boolean' | 'number';
    }
) {
    console.log(`[Admin Action] Updating feature definition: ${id}`, data);
    try {
        const updates: any = {};
        if (data.label !== undefined) updates.label = data.label;
        if (data.label_en !== undefined) updates.label_en = data.label_en;
        if (data.label_es !== undefined) updates.label_es = data.label_es;
        if (data.label_de !== undefined) updates.label_de = data.label_de;
        if (data.description !== undefined) updates.description = data.description;
        if (data.description_en !== undefined) updates.description_en = data.description_en;
        if (data.description_es !== undefined) updates.description_es = data.description_es;
        if (data.description_de !== undefined) updates.description_de = data.description_de;
        if (data.type !== undefined) updates.type = data.type;

        const { error } = await supabaseAdmin
            .from('feature_definitions')
            .update(updates)
            .eq('id', id);

        if (error) throw new Error(`Feature update failed: ${error.message}`);

        revalidatePath('/admin/subscriptions');
        return { success: true };
    } catch (error: any) {
        console.error("[Admin Action] Update Feature Error:", error);
        return { success: false, error: error.message };
    }
}

export async function deleteFeatureDefinitionAction(id: string) {
    console.log(`[Admin Action] Deleting feature definition: ${id}`);
    try {
        const locale = await getServerLocale();
        // Safety check: verify no plan uses this feature
        const { data: plans } = await supabaseAdmin
            .from('plans')
            .select('id, name, features');

        if (plans) {
            const usedBy: string[] = [];
            for (const plan of plans) {
                const features = plan.features as any;
                if (!features) continue;
                for (const category of ['core', 'advanced', 'vip']) {
                    if (features[category] && id in features[category]) {
                        usedBy.push(plan.name);
                        break;
                    }
                }
            }
            if (usedBy.length > 0) {
                return {
                    success: false,
                    error: `${copy(locale, 'Impossible de supprimer : cette feature est utilisée par')} ${usedBy.join(', ')}`
                };
            }
        }

        const { error } = await supabaseAdmin
            .from('feature_definitions')
            .delete()
            .eq('id', id);

        if (error) throw new Error(`Feature deletion failed: ${error.message}`);

        revalidatePath('/admin/subscriptions');
        return { success: true };
    } catch (error: any) {
        console.error("[Admin Action] Delete Feature Error:", error);
        return { success: false, error: error.message };
    }
}
