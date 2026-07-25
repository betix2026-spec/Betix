// =============================================================================
// BETIX — Script de création des utilisateurs de test
// Exécuter avec : node scripts/create-test-users.mjs
// =============================================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_USER_PASSWORD = process.env.BETIX_TEST_USER_PASSWORD;

if (!TEST_USER_PASSWORD) {
    throw new Error("Set BETIX_TEST_USER_PASSWORD before creating test users.");
}

const testUsers = [
    {
        email: "superadmin@betix.io",
        password: TEST_USER_PASSWORD,
        username: "SuperAdmin",
        role: "super_admin",
    },
    {
        email: "admin@betix.io",
        password: TEST_USER_PASSWORD,
        username: "AdminBetix",
        role: "admin",
    },
    {
        email: "user@betix.io",
        password: TEST_USER_PASSWORD,
        username: "TestUser",
        role: "user",
    },
];

async function createUser(userData) {
    console.log(`\n📝 Creating ${userData.role}: ${userData.email}...`);

    // 1. Create auth user
    const authRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            apikey: SERVICE_ROLE_KEY,
        },
        body: JSON.stringify({
            email: userData.email,
            password: userData.password,
            email_confirm: true, // Auto-confirm email
            user_metadata: {
                username: userData.username,
            },
        }),
    });

    if (!authRes.ok) {
        const err = await authRes.json();
        if (err.msg?.includes("already been registered") || err.message?.includes("already been registered")) {
            console.log(`   ⚠️  User ${userData.email} already exists. Updating role...`);

            // Fetch existing user to get ID
            const listRes = await fetch(
                `${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=50`,
                {
                    headers: {
                        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
                        apikey: SERVICE_ROLE_KEY,
                    },
                }
            );
            const listData = await listRes.json();
            const existingUser = listData.users?.find((u) => u.email === userData.email);

            if (existingUser) {
                console.log(`   ⚠️  User ${userData.email} already exists. Forcing password reset and updating role...`);

                // Update password and metadata in auth
                const updateAuthRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${existingUser.id}`, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
                        apikey: SERVICE_ROLE_KEY,
                    },
                    body: JSON.stringify({
                        password: userData.password,
                        user_metadata: {
                            username: userData.username,
                        },
                    }),
                });

                if (!updateAuthRes.ok) {
                    console.error(`   ❌ Auth update error:`, await updateAuthRes.json());
                }

                // Update role in profiles
                await updateRole(existingUser.id, userData.role, userData.username);
                return;
            }
        }
        console.error(`   ❌ Auth error:`, err);
        return;
    }

    const authData = await authRes.json();
    const userId = authData.id;
    console.log(`   ✅ Auth user created: ${userId}`);

    // 2. Wait briefly for the trigger to create the profile
    await new Promise((r) => setTimeout(r, 1000));

    // 3. Update the role in profiles table
    await updateRole(userId, userData.role, userData.username);
}

async function updateRole(userId, role, username) {
    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`,
        {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
                apikey: SERVICE_ROLE_KEY,
                Prefer: "return=minimal",
            },
            body: JSON.stringify({
                role: role,
                username: username,
                onboarding_completed: true,
            }),
        }
    );

    if (res.ok) {
        console.log(`   ✅ Role updated to: ${role}`);
    } else {
        const err = await res.text();
        console.error(`   ❌ Role update error:`, err);
    }
}

async function main() {
    console.log("🚀 BETIX — Creating test users...\n");
    console.log("━".repeat(50));

    for (const user of testUsers) {
        await createUser(user);
    }

    console.log("\n" + "━".repeat(50));
    console.log("\n✅ Done! Test accounts:");
    console.log("┌──────────────────────┬──────────────┐");
    console.log("│ Email                │ Role         │");
    console.log("├──────────────────────┼──────────────┤");
    testUsers.forEach((u) => {
        console.log(
            `│ ${u.email.padEnd(20)} │ ${u.role.padEnd(12)} │`
        );
    });
    console.log("└──────────────────────┴──────────────┘");
}

main().catch(console.error);
