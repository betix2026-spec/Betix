import type { Metadata } from "next";
import { Inter, Geist_Mono, Montserrat, Space_Grotesk, DM_Sans, Poppins, Raleway, Outfit, Plus_Jakarta_Sans, Nunito } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { getServerLocale } from "@/lib/i18n-server";
import "./globals.css";

const inter = Inter({
    variable: "--font-inter",
    subsets: ["latin"],
    display: "swap",
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
    display: "swap",
});

const montserrat = Montserrat({
    variable: "--font-montserrat",
    subsets: ["latin"],
    display: "swap",
});

const spaceGrotesk = Space_Grotesk({
    variable: "--font-space-grotesk",
    subsets: ["latin"],
    display: "swap",
});

const dmSans = DM_Sans({
    variable: "--font-dm-sans",
    subsets: ["latin"],
    display: "swap",
});

const poppins = Poppins({
    variable: "--font-poppins",
    subsets: ["latin"],
    weight: ["300", "400", "500", "600", "700", "800"],
    display: "swap",
});

const raleway = Raleway({
    variable: "--font-raleway",
    subsets: ["latin"],
    display: "swap",
});

const outfit = Outfit({
    variable: "--font-outfit",
    subsets: ["latin"],
    display: "swap",
});

const plusJakarta = Plus_Jakarta_Sans({
    variable: "--font-plus-jakarta",
    subsets: ["latin"],
    display: "swap",
});

const nunito = Nunito({
    variable: "--font-nunito",
    subsets: ["latin"],
    display: "swap",
});

const METADATA_BY_LOCALE: Record<string, { description: string; keywords: string[] }> = {
    fr: {
        description:
            "Plateforme SaaS premium de pronostics sportifs propulsée par l'Intelligence Artificielle. Football, Basketball, Tennis.",
        keywords: ["pronostics sportifs", "IA", "paris sportifs", "football", "basketball", "tennis", "intelligence artificielle"],
    },
    en: {
        description:
            "Premium SaaS platform for sports predictions powered by Artificial Intelligence. Football, Basketball, Tennis.",
        keywords: ["sports predictions", "AI", "sports betting", "football", "basketball", "tennis", "artificial intelligence"],
    },
    es: {
        description:
            "Plataforma SaaS premium de pronósticos deportivos impulsada por Inteligencia Artificial. Fútbol, Baloncesto, Tenis.",
        keywords: ["pronósticos deportivos", "IA", "apuestas deportivas", "fútbol", "baloncesto", "tenis", "inteligencia artificial"],
    },
    de: {
        description:
            "Premium-SaaS-Plattform für Sportvorhersagen mit künstlicher Intelligenz. Fußball, Basketball, Tennis.",
        keywords: ["Sportvorhersagen", "KI", "Sportwetten", "Fußball", "Basketball", "Tennis", "künstliche Intelligenz"],
    },
};

export async function generateMetadata(): Promise<Metadata> {
    const locale = await getServerLocale();
    const { description, keywords } = METADATA_BY_LOCALE[locale] ?? METADATA_BY_LOCALE.en;

    return {
        title: {
            default: "BETIX",
            template: "%s | BETIX",
        },
        description,
        icons: {
            icon: "https://pklyygllmbfbdmfmozxq.supabase.co/storage/v1/object/public/logos/betix_logo2.png",
        },
        keywords,
    };
}

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const locale = await getServerLocale();

    return (
        <html lang={locale} className="dark">
            <body
                className={`${inter.variable} ${geistMono.variable} ${montserrat.variable} ${spaceGrotesk.variable} ${dmSans.variable} ${poppins.variable} ${raleway.variable} ${outfit.variable} ${plusJakarta.variable} ${nunito.variable} antialiased min-h-screen`}
            >
                <ThemeProvider>
                <AuthProvider>
                    <TooltipProvider delayDuration={300}>
                        {children}
                    </TooltipProvider>
                    <Toaster
                        position="bottom-right"
                        richColors
                        closeButton
                        toastOptions={{
                            duration: 5000,
                        }}
                    />
                </AuthProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}
