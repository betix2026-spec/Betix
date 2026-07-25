"use client";

import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { HelpCircle } from "lucide-react";
import { useI18n } from "@/lib/use-i18n";

export function FAQSection() {
    const { t } = useI18n();
    const faqs = [
        {
            q: t("faqPlanQuestion"),
            a: t("faqPlanAnswer")
        },
        {
            q: t("faqPaymentQuestion"),
            a: t("faqPaymentAnswer")
        },
        {
            q: t("faqGuaranteeQuestion"),
            a: t("faqGuaranteeAnswer")
        },
        {
            q: t("faqAiQuestion"),
            a: t("faqAiAnswer")
        }
    ];

    return (
        <div className="max-w-3xl mx-auto">
            <h2 className="text-2xl font-black uppercase tracking-tight text-center mb-8 flex items-center justify-center gap-3">
                <HelpCircle className="size-6 text-neutral-500" />
                {t("faqTitle")}
            </h2>

            <Accordion type="single" collapsible className="space-y-4">
                {faqs.map((item, i) => (
                    <AccordionItem
                        key={i}
                        value={`q${i}`}
                        className="group border border-white/5 bg-black/40 rounded-xl px-2 overflow-hidden hover:border-white/10 transition-colors data-[state=open]:border-blue-500/30 data-[state=open]:bg-blue-500/[0.02]"
                    >
                        <AccordionTrigger className="text-base font-bold text-neutral-300 hover:text-white hover:no-underline py-5 px-4">
                            {item.q}
                        </AccordionTrigger>
                        <AccordionContent className="text-sm text-neutral-400 pb-5 px-4 leading-relaxed">
                            {item.a}
                        </AccordionContent>
                    </AccordionItem>
                ))}
            </Accordion>
        </div>
    );
}
