import { Metadata } from "next";
import { getServerLocale } from "@/lib/i18n-server";
import { getTermsContent } from "@/lib/legal-content";

export async function generateMetadata(): Promise<Metadata> {
    const content = getTermsContent(await getServerLocale());
    return {
        title: `${content.title} | BETIX`,
        description: content.title,
    };
}

export default async function CGUPage() {
    const locale = await getServerLocale();
    const content = getTermsContent(locale);

    return (
        <div className="min-h-screen bg-black pt-32 pb-20 relative overflow-hidden">
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[120%] h-[120%] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/10 via-black to-black" />
                <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />
            </div>

            <div className="max-w-4xl mx-auto px-6 relative z-10">
                <div className="mb-12">
                    <h1 className="text-4xl md:text-5xl font-black text-white uppercase tracking-tighter mb-4">
                        {content.title.replace(content.accent, "").trim()}{" "}
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">
                            {content.accent}
                        </span>
                    </h1>
                    <p className="text-neutral-400 text-lg">{content.updated}</p>
                </div>

                <div className="space-y-12 text-neutral-300 leading-relaxed">
                    {content.sections.map((section, index) => (
                        <section key={section.title} className="space-y-4">
                            <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                                <span className="text-blue-500 font-mono text-lg">
                                    {String(index + 1).padStart(2, "0")}.
                                </span>
                                {section.title}
                            </h2>
                            <div className="bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-sm space-y-4">
                                {section.paragraphs.map((paragraph) => (
                                    <p key={paragraph}>{paragraph}</p>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            </div>
        </div>
    );
}
