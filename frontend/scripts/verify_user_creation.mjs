
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load env vars from .env.local
const envPath = path.resolve(process.cwd(), '.env.local');

if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf-8');
    envConfig.split('\n').forEach(line => {
        const [key, ...values] = line.split('=');
        if (key && values.length > 0) {
            const value = values.join('=');
            process.env[key.trim()] = value.trim().replace(/^"(.*)"$/, '$1');
        }
    });
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const testPassword = process.env.BETIX_TEST_USER_PASSWORD;

if (!supabaseUrl || !supabaseServiceKey || !testPassword) {
    console.error("❌ Missing Supabase credentials or BETIX_TEST_USER_PASSWORD in .env.local");
    process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
    console.log("🚀 Testing User Creation (Direct Admin Client)...");

    const uniqueId = Date.now();
    const testUser = {
        username: `Agent_${uniqueId}`,
        email: `agent_${uniqueId}@betix.io`,
        password: testPassword,
        role: "user",
        plan_id: "free"
    };

    console.log("Payload:", { ...testUser, password: "[redacted]" });

    // 1. Create Auth User
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email: testUser.email,
        password: testUser.password,
        email_confirm: true,
        user_metadata: {
            username: testUser.username
        }
    });

    if (authError) {
        console.error("❌ Auth creation failed:", authError.message);
        return;
    }

    const userId = authUser.user.id;
    console.log(`✅ Auth User created! ID: ${userId}`);

    // 2. Update Profile
    const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert({
            id: userId,
            username: testUser.username,
            role: testUser.role,
            created_at: new Date().toISOString()
        });

    if (profileError) {
        console.error("❌ Profile creation failed:", profileError.message);
    } else {
        console.log("✅ Profile created/updated.");
    }

    // 3. Create Subscription
    const { error: subError } = await supabaseAdmin
        .from('subscriptions')
        .insert({
            user_id: userId,
            plan_id: testUser.plan_id,
            status: 'active',
            current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            source: 'manual_gift'
        });

    if (subError) {
        console.error("❌ Subscription creation failed:", subError.message);
    } else {
        console.log("✅ Subscription created.");
    }
}

main().catch(console.error);
