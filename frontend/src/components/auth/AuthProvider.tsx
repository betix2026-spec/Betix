"use client";

import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { User, Session, AuthChangeEvent } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// =============================================================================
// Types
// =============================================================================

export type UserRole = "user" | "admin" | "super_admin";

interface Profile {
    id: string;
    username: string;
    avatar_url: string | null;
    role: UserRole;
    onboarding_completed: boolean;
    favorite_sports: string[];
}

export interface UserPlan {
    id: string;
    name: string;
    price: number;
    frequency?: string;
    features: (string | { text: string; included: boolean })[];
}

export interface UserSubscription {
    status: string;
    current_period_end: string;
    created_at?: string | null;
    cancel_at_period_end?: boolean;
    canceled_at?: string | null;
    cancellation_reason?: string | null;
    estimated_refund_amount?: number | null;
    plan: UserPlan | null;
}

interface AuthContextType {
    user: User | null;
    session: Session | null;
    profile: Profile | null;
    subscription: UserSubscription | null;
    currentPlanId: string;
    role: UserRole;
    isLoading: boolean;
    isAdmin: boolean;
    isSuperAdmin: boolean;
    signIn: (email: string, password: string) => Promise<{ error: string | null }>;
    signInWithGoogle: (redirectTo?: string) => Promise<{ error: string | null }>;
    signInWithMagicLink: (email: string, redirectTo?: string) => Promise<{ error: string | null }>;
    signUp: (email: string, password: string) => Promise<{
        error: string | null;
        session: Session | null;
        user: User | null;
        needsConfirmation: boolean;
    }>;
    signOut: () => Promise<void>;
    resetPasswordForEmail: (email: string) => Promise<{ error: string | null }>;
    updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
    refreshProfile: () => Promise<void>;
    assuranceLevel: {
        current: string | null;
        next: string | null;
    } | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// =============================================================================
// Provider
// =============================================================================

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<Profile | null>(null);
    const [subscription, setSubscription] = useState<UserSubscription | null>(null);
    const [assuranceLevel, setAssuranceLevel] = useState<{ current: string | null; next: string | null } | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Memoize the supabase client so it doesn't trigger infinite loops in hooks
    const supabase = useMemo(() => createClient(), []);

    // Fetch user profile and subscription
    const fetchProfile = useCallback(async (userId: string) => {
        try {
            // 1. Fetch Profile
            const { data: profileData, error: profileError } = await supabase
                .from("profiles")
                .select("id, username, avatar_url, role, onboarding_completed, favorite_sports")
                .eq("id", userId)
                .single();

            if (profileError) {
                console.error("Error fetching profile:", profileError.message);
                return null;
            }

            // 2. Fetch Subscription (with Plan)
            const { data: subData, error: subError } = await supabase
                .from("subscriptions")
                .select("status, current_period_end, created_at, cancel_at_period_end, canceled_at, cancellation_reason, estimated_refund_amount, plans(id, name, price, frequency, features)")
                .eq("user_id", userId)
                .in("status", ["active", "trialing", "past_due"])
                .maybeSingle();

            // Transform subscription data
            let userSub: UserSubscription | null = null;
            if (subData) {
                const planData = Array.isArray(subData.plans) ? subData.plans[0] : subData.plans;
                userSub = {
                    status: subData.status,
                    current_period_end: subData.current_period_end,
                    created_at: subData.created_at,
                    cancel_at_period_end: subData.cancel_at_period_end ?? false,
                    canceled_at: subData.canceled_at,
                    cancellation_reason: subData.cancellation_reason,
                    estimated_refund_amount: subData.estimated_refund_amount,
                    plan: planData as UserPlan
                };
            }

            return { profile: profileData as Profile, subscription: userSub };
        } catch (err) {
            console.error("Unexpected error fetching data:", err);
            return null;
        }
    }, [supabase]);

    const refreshProfile = useCallback(async () => {
        if (user) {
            const data = await fetchProfile(user.id);
            if (data) {
                setProfile(data.profile);
                setSubscription(data.subscription);
            }
        }
    }, [user, fetchProfile]);

    // Auth functions
    const signIn = useCallback(async (email: string, password: string) => {
        console.log(`[AuthProvider] Signing in with: ${email}`);
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) console.error("[AuthProvider] SignIn failed:", error.message);
        return { error: error?.message || null };
    }, [supabase]);

    const appUrl = (typeof window !== 'undefined' ? window.location.origin : '') || process.env.NEXT_PUBLIC_APP_URL || '';

    const signInWithGoogle = useCallback(async (redirectTo = "/dashboard") => {
        logger.info("[AuthProvider] Initiating Google OAuth...");
        const next = redirectTo.startsWith("/") && !redirectTo.startsWith("//") ? redirectTo : "/dashboard";
        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${appUrl}/api/auth/callback?next=${encodeURIComponent(next)}`,
            },
        });
        if (error) logger.error("[AuthProvider] Google OAuth failed:", error.message);
        return { error: error?.message || null };
    }, [supabase, appUrl]);

    const signInWithMagicLink = useCallback(async (email: string, redirectTo = "/dashboard") => {
        logger.info(`[AuthProvider] Sending Magic Link to: ${email}`);
        const next = redirectTo.startsWith("/") && !redirectTo.startsWith("//") ? redirectTo : "/dashboard";
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo: `${appUrl}/api/auth/callback?next=${encodeURIComponent(next)}`,
            },
        });
        if (error) logger.error("[AuthProvider] Magic Link failed:", error.message);
        return { error: error?.message || null };
    }, [supabase, appUrl]);

    const signUp = useCallback(async (email: string, password: string) => {
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                emailRedirectTo: `${appUrl}/api/auth/callback`,
            },
        });

        return {
            error: error?.message || null,
            session: data?.session || null,
            user: data?.user || null,
            needsConfirmation: !error && !data?.session
        };
    }, [supabase]);

    const signOut = useCallback(async () => {
        console.log("[AuthProvider] Initiating Atomic SignOut...");
        try {
            const form = document.createElement("form");
            form.method = "POST";
            form.action = "/api/auth/signout";
            document.body.appendChild(form);
            form.submit();
        } catch (err) {
            console.error("[AuthProvider] SignOut failed, falling back to client-side", err);
            await supabase.auth.signOut();
            window.location.replace("/login");
        }
    }, [supabase]);

    const resetPasswordForEmail = useCallback(async (email: string) => {
        logger.info(`[AuthProvider] Sending password reset to: ${email}`);
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/update-password`,
        });
        if (error) logger.error("[AuthProvider] Password reset failed:", error.message);
        return { error: error?.message || null };
    }, [supabase]);

    const updatePassword = useCallback(async (newPassword: string) => {
        logger.info("[AuthProvider] Updating password...");
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) logger.error("[AuthProvider] Password update failed:", error.message);
        return { error: error?.message || null };
    }, [supabase]);

    // Derived state
    const role: UserRole = profile?.role ?? "user";
    const isAdmin = role === "admin" || role === "super_admin";
    const isSuperAdmin = role === "super_admin";
    const currentPlanId = subscription?.plan?.id || "no_subscription";

    // Memoize context value
    const contextValue = useMemo(() => ({
        user,
        session,
        profile,
        subscription,
        currentPlanId,
        role,
        isLoading,
        isAdmin,
        isSuperAdmin,
        signIn,
        signInWithGoogle,
        signInWithMagicLink,
        signUp,
        signOut,
        resetPasswordForEmail,
        updatePassword,
        refreshProfile,
        assuranceLevel,
    }), [user, session, profile, subscription, currentPlanId, role, isLoading, isAdmin, isSuperAdmin, signIn, signInWithGoogle, signInWithMagicLink, signUp, signOut, resetPasswordForEmail, updatePassword, refreshProfile, assuranceLevel]);

    const lastFetchedUserId = useRef<string | null>(null);
    const isInitialCheckDone = useRef(false);

    useEffect(() => {
        let mounted = true;
        console.log("[AuthProvider] Auth System Initialization...");

        const handleSession = async (session: Session | null, source: string) => {
            if (!mounted) return;

            const userId = session?.user?.id || null;
            const isNewUser = userId !== lastFetchedUserId.current;

            // Fetch AAL
            const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
            if (mounted && aal) {
                setAssuranceLevel({
                    current: aal.currentLevel,
                    next: aal.nextLevel
                });
            }

            // Avoid redundant fetches for the same user if we already did initial check
            if (!isNewUser && isInitialCheckDone.current) {
                logger.info(`Skipping redundant fetch (${source})`, { userId }, "AuthProvider");
                setIsLoading(false);
                return;
            }

            logger.info(`Handling Auth (${source})`, { event: source, userId, isNewUser }, "AuthProvider");

            if (!session) {
                setSession(null);
                setUser(null);
                setProfile(null);
                setSubscription(null);
                setIsLoading(false);
                lastFetchedUserId.current = null;
                isInitialCheckDone.current = true;
                return;
            }

            // Clear profile if user changed to avoid showing old data
            if (isNewUser) {
                setProfile(null);
                setSubscription(null);
            }

            // Only block UI for the very first load or if profile is missing
            const needsInitialHydration = !isInitialCheckDone.current || !profile;
            if (needsInitialHydration) setIsLoading(true);

            // If we are here, we have a session
            setSession(session);
            setUser(session.user);
            lastFetchedUserId.current = userId;

            try {
                const data = await fetchProfile(session.user.id);
                if (mounted && data) {
                    setProfile(data.profile);
                    setSubscription(data.subscription);
                    logger.success(`Profile updated (${source})`, { role: data.profile.role }, "AuthProvider");
                }
            } catch (err: any) {
                if (err.name === 'AbortError' || err.message?.includes('aborted')) {
                    logger.info("Fetch aborted", null, "AuthProvider");
                } else {
                    logger.error("Profile hydration error", err, "AuthProvider");
                }
            } finally {
                if (mounted) {
                    setIsLoading(false);
                    isInitialCheckDone.current = true;
                }
            }
        };

        // 1. Initial Load Check
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!isInitialCheckDone.current) {
                handleSession(session, "INITIAL_LOAD");
            }
        }).catch(err => {
            if (err.name !== 'AbortError') {
                logger.error("GetSession Failure", err, "AuthProvider");
            }
            if (mounted) setIsLoading(false);
        });

        // 2. Continuous Listener
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
            if (!mounted) return;

            // Ignore redundant INITIAL_SESSION if we already handled INITIAL_LOAD
            if ((event as any) === 'INITIAL_SESSION' && isInitialCheckDone.current) return;

            if (event === 'SIGNED_OUT' || !newSession) {
                handleSession(null, "SIGNED_OUT");
            } else {
                handleSession(newSession, event);
            }
        });

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, [supabase, fetchProfile]); // profile AND lastFetchedUserId REMOVED FROM DEPENDENCIES

    return (
        <AuthContext.Provider value={contextValue}>
            {children}
        </AuthContext.Provider>
    );
}

// =============================================================================
// Hook
// =============================================================================

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}
