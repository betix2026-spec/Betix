import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';

// Note: This client should ONLY be used in server-side contexts (Server Actions, API Routes)
// NEVER import this in client components.

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
    if (adminClient) return adminClient;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Missing Supabase Service Role Key');
    }

    adminClient = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });

    return adminClient;
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
    get(_target, property, receiver) {
        return Reflect.get(getSupabaseAdmin(), property, receiver);
    },
});
