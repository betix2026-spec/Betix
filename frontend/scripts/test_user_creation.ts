
import { createAgentAction } from "../src/app/(admin)/admin/users/actions";
import { supabaseAdmin } from "../src/lib/supabase-admin";

async function main() {
    console.log("🚀 Testing User Creation...");
    const testPassword = process.env.BETIX_TEST_USER_PASSWORD;

    if (!testPassword) {
        throw new Error("Set BETIX_TEST_USER_PASSWORD before running this script.");
    }

    const testUser = {
        username: `Agent_${Date.now()}`,
        email: `agent_${Date.now()}@betix.io`,
        password: testPassword,
        role: "user",
        plan_id: "free"
    };

    console.log("Payload:", { ...testUser, password: "[redacted]" });

    const result = await createAgentAction(testUser);

    if (result.success && result.userId) {
        console.log(`✅ User created successfully! ID: ${result.userId}`);

        // Verify DB
        const { data: profile } = await supabaseAdmin.from('profiles').select('*').eq('id', result.userId).single();
        const { data: sub } = await supabaseAdmin.from('subscriptions').select('*').eq('user_id', result.userId).single();

        console.log("Profile:", profile ? "OK" : "MISSING");
        console.log("Subscription:", sub ? "OK" : "MISSING");

        if (profile && sub) {
            console.log("✅ FULL SUCCESS: DB Records created.");
        } else {
            console.error("❌ PARTIAL FAILURE: Missing DB records.");
        }

    } else {
        console.error("❌ Creation failed:", result.error);
    }
}

main().catch(console.error);
