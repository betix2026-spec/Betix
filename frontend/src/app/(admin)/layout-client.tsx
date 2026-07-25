"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, Loader2 } from "lucide-react";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { useAuth } from "@/components/auth/AuthProvider";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/use-i18n";

export default function AdminLayoutClient({
    children,
}: {
    children: React.ReactNode;
}) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const { isLoading, profile } = useAuth();
    const { copy } = useI18n();

    return (
        <div className="min-h-screen flex bg-black">
            {/* Loading Overlay for Initial Hydration */}
            {isLoading && !profile && (
                <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black gap-4">
                    <BetixLogoAnimated />
                    <div className="flex items-center gap-2 text-blue-500 font-bold uppercase tracking-widest text-xs">
                        <Loader2 className="size-4 animate-spin" />
                        {copy("Initialisation Système...")}
                    </div>
                </div>
            )}

            {/* Sidebar — hidden on mobile, visible on lg+ */}
            <AdminSidebar className="hidden lg:flex" />

            {/* Mobile sidebar overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-[60] lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                >
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                    <AdminSidebar className="relative z-[70] h-full animate-slide-in-right" />
                </div>
            )}

            {/* Main area */}
            <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
                <AdminHeader onMenuClick={() => setSidebarOpen(true)} />

                <main className="flex-1 overflow-auto p-4 md:p-8 relative">
                    {/* Page Content Guard: Hide children only on initial empty load */}
                    {isLoading && !profile ? (
                        <div className="absolute inset-0 bg-black" />
                    ) : (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-700 max-w-[1600px] mx-auto">
                            {children}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}

function BetixLogoAnimated() {
    return (
        <div className="flex items-center gap-2 mb-2">
            <div className="size-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-[0_0_30px_rgba(37,99,235,0.4)]">
                <span className="text-white font-black text-2xl italic tracking-tighter">B</span>
            </div>
            <span className="text-2xl font-black text-white italic tracking-tighter uppercase">Betix</span>
        </div>
    );
}
