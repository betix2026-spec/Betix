import { Plan, FeatureDefinition, PlanFeature, PlanFeatures } from "@/types/plans";
import { pickLocalized, type Locale } from "@/lib/i18n";

/**
 * Formats a raw feature value into a human-readable string.
 * e.g. value="20/j" -> "20/j"
 * e.g. value=true -> "Inclus" (or just the feature label)
 */
export function formatFeatureValue(value: string | number | boolean): string {
    if (typeof value === 'boolean') {
        return value ? "" : "Non inclus"; // Booleans often just mean "display the label"
    }
    return String(value);
}

/**
 * Flattens the structured features (core, advanced, vip) into a simple list for display.
 * Uses feature_definitions to get the proper Label and Description.
 */
export function getDisplayFeatures(
    plan: Plan,
    definitions: FeatureDefinition[],
    locale?: Locale | null
): { text: string; included: boolean; tooltip?: string }[] {

    const displayList: { text: string; included: boolean; tooltip?: string }[] = [];
    const categories: (keyof PlanFeatures)[] = ['core', 'advanced', 'vip'];

    // Create a map of definitions for quick lookup
    const defMap = new Map(definitions.map(d => [d.id, d]));

    categories.forEach(category => {
        const features = plan.features[category];
        if (!features) return;

        Object.entries(features).forEach(([key, value]) => {
            const def = defMap.get(key);
            const label = def
                ? pickLocalized(locale, def.label, { en: def.label_en, es: def.label_es, de: def.label_de })
                : key; // Fallback to key if no definition
            const description = def?.description
                ? pickLocalized(locale, def.description, { en: def.description_en, es: def.description_es, de: def.description_de })
                : undefined;

            let included = true;
            let displayValue = "";

            // Handle different value structures
            if (typeof value === 'object' && value !== null && 'value' in value) {
                // It's a complex PlanFeature object
                const pf = value as PlanFeature;
                included = pf.value !== false;
                displayValue = pf.display || formatFeatureValue(pf.value);
            } else {
                // It's a simplistic value (string/boolean/number) directly
                included = value !== false;
                displayValue = formatFeatureValue(value as string | number | boolean);
            }

            // Construct the final text
            // If boolean true: "Journal"
            // If string "2/j": "2/j Journal" or "Journal (2/j)"? 
            // Design choice: "Label: Value" or "Value Label"
            // Let's go with: "Label" if boolean, "Label: Value" if string

            let text = label;
            if (displayValue && typeof value !== 'boolean') {
                text = `${label}: ${displayValue}`;
            }

            displayList.push({
                text,
                included,
                tooltip: description
            });
        });
    });

    return displayList;
}

/**
 * Calculates the monthly equivalent price for an annual plan.
 */
export function getMonthlyEquivalent(price: number, frequency: string): string {
    if (frequency === 'yearly') {
        return (price / 12).toFixed(2);
    }
    return price.toFixed(2);
}
