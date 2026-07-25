import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminLayoutClient from "./layout-client";
import { RedirectToDashboard } from "@/components/auth/RedirectToDashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // 1. Initialize Server Client
    const supabase = await createClient();

    // 2. Check User Session
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        // If no user at all, technical redirect to login is usually safe enough 
        // because we don't need to save a session cookie.
        redirect("/login?redirect=/admin");
    }

    // 3. Check Admin Role
    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

    const role = profile?.role;

    if (!profile || (role !== "admin" && role !== "super_admin")) {
        console.log(`[AdminLayout] Access Denied for user ${user.id}. Role: ${role}. Soft-Redirecting to /dashboard.`);

        // 4. SOFT REDIRECT: Return a client component that redirects.
        // This ensures the response 200 OK is sent, preserving any Set-Cookie headers
        // from supabase.auth.getUser() (session refresh).
        return <RedirectToDashboard />;
    }

    // 5. Authorized -> Render UI Shell
    return (
        <AdminLayoutClient>
            {children}
        </AdminLayoutClient>
    );
}
