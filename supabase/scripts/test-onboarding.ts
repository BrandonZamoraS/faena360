#!/usr/bin/env tsx
/**
 * Automated onboarding test runner.
 *
 * Usage:
 *   pnpm test:onboarding
 *
 * Prerequisites:
 *   - Supabase CLI installed
 *   - supabase start (local stack running)
 *
 * This script automatically:
 *   1. Detects local Supabase credentials from `supabase status`
 *   2. Runs the full tenant onboarding flow with test data
 *   3. Verifies all persisted state (tenant, auth user, profile, roles, grants)
 *   4. Runs negative flow tests (invalid payloads, duplicates, missing capabilities)
 *   5. Cleans up test data
 *   6. Reports PASS/FAIL
 */

import { execSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  parseTenantOnboardingRequestFromJson,
  runTenantOnboardingFlow,
  type TenantOnboardingRequest,
} from "./create-tenant-with-admin";

const TEST_ID = `test-${Date.now()}`;
const TEST_TENANT_SLUG = `onboarding-test-${TEST_ID}`;
const TEST_ADMIN_EMAIL = `admin-${TEST_ID}@test.local`;

const TEST_PAYLOAD: TenantOnboardingRequest = {
  tenant: {
    name: `Onboarding Test ${TEST_ID}`,
    slug: TEST_TENANT_SLUG,
    timezone: "America/Argentina/Buenos_Aires",
    currency: "ARS",
    fuelUnit: "liters",
  },
  admin: {
    email: TEST_ADMIN_EMAIL,
    temporaryPassword: `TempPass_${TEST_ID}`,
    fullName: "Test Admin",
    phone: "+54 9 11 1234-5678",
  },
};

type SupabaseStatus = {
  API_URL: string;
  SERVICE_ROLE_KEY: string;
};

function getSupabaseStatus(): SupabaseStatus {
  try {
    const output = execSync("npx supabase status --output json", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const status = JSON.parse(output) as Record<string, string>;

    const apiUrl = status["API URL"] || status["API_URL"] || status["api_url"];
    const serviceRoleKey =
      status["service_role_key"] ||
      status["SERVICE_ROLE_KEY"] ||
      status["anon_key"]; // fallback for older versions

    if (!apiUrl || !serviceRoleKey) {
      throw new Error(
        "Could not extract API_URL or SERVICE_ROLE_KEY from supabase status"
      );
    }

    return {
      API_URL: apiUrl,
      SERVICE_ROLE_KEY: serviceRoleKey,
    };
  } catch (error) {
    console.error("❌ Failed to get Supabase status. Is supabase running?");
    console.error("   Run: supabase start");
    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);
    }
    process.exit(1);
  }
}

function createSupabaseClient(url: string, serviceRoleKey: string): SupabaseClient {
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

type VerificationResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

async function verifyOnboardingResult(
  admin: SupabaseClient,
  tenantSlug: string,
  adminEmail: string
): Promise<VerificationResult[]> {
  const results: VerificationResult[] = [];

  // 1. Verify tenant exists
  const { data: tenant, error: tenantError } = await admin
    .from("tenants")
    .select("id, name, slug, timezone, currency, fuel_unit")
    .eq("slug", tenantSlug)
    .single();

  if (tenantError || !tenant) {
    results.push({
      ok: false,
      message: `Tenant with slug '${tenantSlug}' not found: ${tenantError?.message ?? "unknown error"}`,
    });
  } else {
    results.push({
      ok: true,
      message: `✅ Tenant created: ${tenant.name} (${tenant.slug})`,
    });
  }

  const tenantId = tenant?.id;

  // 2. Verify auth user exists
  let authUserId: string | undefined;
  try {
    const {
      data: { users },
      error: listError,
    } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });

    if (listError) throw listError;

    const authUser = users.find(
      (u: { email?: string | null }) =>
        (u.email?.toLowerCase() ?? "") === adminEmail.toLowerCase()
    );

    if (!authUser) {
      results.push({
        ok: false,
        message: `Auth user with email '${adminEmail}' not found`,
      });
    } else {
      authUserId = authUser.id;
      results.push({
        ok: true,
        message: `✅ Auth user created: ${authUser.email} (${authUser.id})`,
      });
    }
  } catch (error) {
    results.push({
      ok: false,
      message: `Failed to list auth users: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  // 3. Verify profile exists and is linked to tenant
  if (tenantId) {
    const { data: profile, error: profileError } = await admin
      .from("user_profiles")
      .select("id, email, tenant_id, full_name, auth_user_id")
      .eq("tenant_id", tenantId)
      .eq("email", adminEmail)
      .single();

    if (profileError || !profile) {
      results.push({
        ok: false,
        message: `Profile for email '${adminEmail}' not found in tenant: ${profileError?.message ?? "unknown error"}`,
      });
    } else {
      results.push({
        ok: true,
        message: `✅ Profile created: ${profile.email} (${profile.id})`,
      });

      // Verify profile auth_user_id matches auth user
      if (authUserId && profile.auth_user_id !== authUserId) {
        results.push({
          ok: false,
          message: `Profile auth_user_id mismatch: expected ${authUserId}, got ${profile.auth_user_id}`,
        });
      } else if (authUserId) {
        results.push({
          ok: true,
          message: `✅ Profile linked to auth user`,
        });
      }
    }
  }

  // 4. Verify roles exist for tenant
  if (tenantId) {
    const { data: roles, error: rolesError } = await admin
      .from("roles")
      .select("id, name, is_system, is_web_access")
      .eq("tenant_id", tenantId);

    if (rolesError) {
      results.push({
        ok: false,
        message: `Failed to fetch roles: ${rolesError.message}`,
      });
    } else if (!roles || roles.length === 0) {
      results.push({
        ok: false,
        message: `No roles found for tenant`,
      });
    } else {
      results.push({
        ok: true,
        message: `✅ Roles created: ${roles.length} roles (${roles.map((r) => r.name).join(", ")})`,
      });

      // Verify administrador and supervisor have web access
      const administrador = roles.find((r) => r.name === "administrador");
      const supervisor = roles.find((r) => r.name === "supervisor");

      if (!administrador?.is_web_access) {
        results.push({
          ok: false,
          message: `administrador role missing is_web_access`,
        });
      } else {
        results.push({
          ok: true,
          message: `✅ administrador has web access`,
        });
      }

      if (!supervisor?.is_web_access) {
        results.push({
          ok: false,
          message: `supervisor role missing is_web_access`,
        });
      } else {
        results.push({
          ok: true,
          message: `✅ supervisor has web access`,
        });
      }
    }
  }

  // 5. Verify admin role assignment
  if (tenantId) {
    const { data: assignment, error: assignmentError } = await admin
      .from("user_roles")
      .select("user_id, role_id")
      .eq("tenant_id", tenantId)
      .single();

    if (assignmentError) {
      results.push({
        ok: false,
        message: `Admin role assignment not found: ${assignmentError.message}`,
      });
    } else {
      results.push({
        ok: true,
        message: `✅ Admin role assignment created`,
      });
    }
  }

  // 6. Verify capability grants exist
  if (tenantId) {
    const { data: grants, error: grantsError } = await admin
      .from("role_capabilities")
      .select("role_id, capability_id")
      .in(
        "role_id",
        (
          await admin
            .from("roles")
            .select("id")
            .eq("tenant_id", tenantId)
        ).data?.map((r) => r.id) ?? []
      );

    if (grantsError) {
      results.push({
        ok: false,
        message: `Failed to fetch capability grants: ${grantsError.message}`,
      });
    } else if (!grants || grants.length === 0) {
      results.push({
        ok: false,
        message: `No capability grants found for tenant roles`,
      });
    } else {
      results.push({
        ok: true,
        message: `✅ Capability grants created: ${grants.length} grants`,
      });
    }
  }

  return results;
}

async function cleanupTestData(
  admin: SupabaseClient,
  tenantSlug: string,
  adminEmail: string
): Promise<void> {
  console.log("\n🧹 Cleaning up test data...");

  try {
    // Get tenant ID
    const { data: tenant } = await admin
      .from("tenants")
      .select("id")
      .eq("slug", tenantSlug)
      .single();

    if (!tenant) {
      console.log("   No tenant to clean up");
      return;
    }

    const tenantId = tenant.id;

    // Delete user_roles
    await admin.from("user_roles").delete().eq("tenant_id", tenantId);

    // Delete role_capabilities for tenant roles
    const { data: roles } = await admin
      .from("roles")
      .select("id")
      .eq("tenant_id", tenantId);

    if (roles && roles.length > 0) {
      const roleIds = roles.map((r) => r.id);
      await admin.from("role_capabilities").delete().in("role_id", roleIds);

      // Delete roles
      await admin.from("roles").delete().eq("tenant_id", tenantId);
    }

    // Delete profile
    const { data: profile } = await admin
      .from("user_profiles")
      .select("id, auth_user_id")
      .eq("tenant_id", tenantId)
      .eq("email", adminEmail)
      .single();

    if (profile) {
      await admin.from("user_profiles").delete().eq("id", profile.id);

      // Delete auth user
      if (profile.auth_user_id) {
        await admin.auth.admin.deleteUser(profile.auth_user_id);
      }
    }

    // Delete tenant
    await admin.from("tenants").delete().eq("id", tenantId);

    console.log("   ✅ Test data cleaned up");
  } catch (error) {
    console.error(
      `   ⚠️ Cleanup warning: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// ========================
// NEGATIVE FLOW TESTS
// ========================

type NegativeTestResult = {
  name: string;
  passed: boolean;
  message: string;
};

async function runNegativeTests(
  admin: SupabaseClient
): Promise<NegativeTestResult[]> {
  const results: NegativeTestResult[] = [];
  const { runPreflightChecks } = await import("./create-tenant-with-admin");

  const preflightClients = {
    tenantSlugExists: async (slug: string) => {
      const { count } = await admin
        .from("tenants")
        .select("id", { count: "exact", head: true })
        .eq("slug", slug);
      return (count ?? 0) > 0;
    },
    localProfileExistsByEmail: async (email: string) => {
      const { count } = await admin
        .from("user_profiles")
        .select("id", { count: "exact", head: true })
        .eq("email", email);
      return (count ?? 0) > 0;
    },
    authIdentityExistsByEmail: async (email: string) => {
      const normalized = email.toLowerCase();
      let page = 1;
      const perPage = 200;
      while (true) {
        const response = await admin.auth.admin.listUsers({ page, perPage });
        const users = response.data?.users ?? [];
        const found = users.some(
          (item: { email?: string | null }) =>
            (item.email?.toLowerCase?.() ?? "") === normalized
        );
        if (found) return true;
        if (users.length < perPage) return false;
        page += 1;
      }
    },
    capabilityKeysExist: async (keys: readonly string[]) => {
      if (keys.length === 0) return new Set<string>();
      const { data } = await admin
        .from("capabilities")
        .select("key")
        .in("key", keys);
      return new Set((data ?? []).map((row: { key: string }) => row.key));
    },
  };

  const { parseTenantOnboardingRequestFromJson } = await import(
    "./create-tenant-with-admin"
  );

  // Test 1: Invalid shape (empty fullName)
  {
    const name = `invalid-shape-${Date.now()}`;
    const invalidPayload = JSON.stringify({
      tenant: {
        name: "Test Tenant",
        slug: name,
        timezone: "America/Argentina/Buenos_Aires",
        currency: "ARS",
        fuelUnit: "liters",
      },
      admin: {
        email: `admin-${name}@test.local`,
        temporaryPassword: "temp123",
        fullName: "", // INVALID: empty
        phone: "+54 9 11 1234-5678",
      },
    });

    const parseResult = parseTenantOnboardingRequestFromJson(invalidPayload);

    if (!parseResult.ok) {
      results.push({
        name: "Invalid shape (empty fullName) rejected at parse time",
        passed: true,
        message: "✅ Invalid payload correctly rejected during parsing",
      });
    } else {
      results.push({
        name: "Invalid shape (empty fullName) rejected at parse time",
        passed: false,
        message: `❌ Expected parse rejection but got ok=true`,
      });
    }
  }

  // Test 2: Invalid timezone
  {
    const name = `invalid-tz-${Date.now()}`;
    const invalidPayload = JSON.stringify({
      tenant: {
        name: "Test Tenant",
        slug: name,
        timezone: "Invalid/Timezone/Here", // INVALID
        currency: "ARS",
        fuelUnit: "liters",
      },
      admin: {
        email: `admin-${name}@test.local`,
        temporaryPassword: "temp123",
        fullName: "Test Admin",
      },
    });

    const parseResult = parseTenantOnboardingRequestFromJson(invalidPayload);

    if (!parseResult.ok) {
      results.push({
        name: "Invalid timezone rejected at parse time",
        passed: true,
        message: "✅ Invalid timezone correctly rejected during parsing",
      });
    } else {
      results.push({
        name: "Invalid timezone rejected at parse time",
        passed: false,
        message: `❌ Expected parse rejection but got ok=true`,
      });
    }
  }

  // Test 3: Invalid currency
  {
    const name = `invalid-currency-${Date.now()}`;
    const invalidPayload = JSON.stringify({
      tenant: {
        name: "Test Tenant",
        slug: name,
        timezone: "America/Argentina/Buenos_Aires",
        currency: "XYZ", // INVALID
        fuelUnit: "liters",
      },
      admin: {
        email: `admin-${name}@test.local`,
        temporaryPassword: "temp123",
        fullName: "Test Admin",
      },
    });

    const parseResult = parseTenantOnboardingRequestFromJson(invalidPayload);

    if (!parseResult.ok) {
      results.push({
        name: "Invalid currency rejected at parse time",
        passed: true,
        message: "✅ Invalid currency correctly rejected during parsing",
      });
    } else {
      results.push({
        name: "Invalid currency rejected at parse time",
        passed: false,
        message: `❌ Expected parse rejection but got ok=true`,
      });
    }
  }

  // Test 4: Invalid fuel unit
  {
    const name = `invalid-fuel-${Date.now()}`;
    const invalidPayload = {
      tenant: {
        name: "Test Tenant",
        slug: name,
        timezone: "America/Argentina/Buenos_Aires",
        currency: "ARS",
        fuelUnit: "gallons", // INVALID - should be gallons_us or gallons_imperial
      },
      admin: {
        email: `admin-${name}@test.local`,
        temporaryPassword: "temp123",
        fullName: "Test Admin",
      },
    };

    const parseResult = parseTenantOnboardingRequestFromJson(
      JSON.stringify(invalidPayload)
    );

    if (!parseResult.ok) {
      results.push({
        name: "Invalid fuel unit rejected at parse time",
        passed: true,
        message: "✅ Invalid fuel unit correctly rejected during parsing",
      });
    } else {
      results.push({
        name: "Invalid fuel unit rejected at parse time",
        passed: false,
        message: `❌ Expected parse rejection but got ok=true`,
      });
    }
  }

  // Test 5: Duplicate slug rejection
  {
    const name = `duplicate-test-${Date.now()}`;
    const payload: TenantOnboardingRequest = {
      tenant: {
        name: "Duplicate Test",
        slug: name,
        timezone: "America/Argentina/Buenos_Aires",
        currency: "ARS",
        fuelUnit: "liters",
      },
      admin: {
        email: `admin-${name}@test.local`,
        temporaryPassword: "temp123",
        fullName: "Test Admin",
      },
    };

    // First creation should succeed
    let firstCreationOk = false;
    try {
      await runTenantOnboardingFlow(payload);
      firstCreationOk = true;
    } catch {
      results.push({
        name: "Duplicate slug rejection (first creation)",
        passed: false,
        message: `❌ First creation unexpectedly failed`,
      });
    }

    if (firstCreationOk) {
      // Second creation with same slug should be rejected
      const preflight = await runPreflightChecks(payload, preflightClients);
      let errorCaught = false;
      try {
        await runTenantOnboardingFlow(payload);
      } catch {
        errorCaught = true;
      }

      // Cleanup first creation
      await cleanupTestData(admin, name, payload.admin.email);

      if (!preflight.ok && errorCaught) {
        results.push({
          name: "Duplicate slug rejected on second attempt",
          passed: true,
          message: "✅ Duplicate slug correctly rejected by preflight",
        });
      } else {
        results.push({
          name: "Duplicate slug rejected on second attempt",
          passed: false,
          message: `❌ Expected duplicate rejection but got: preflight=${preflight.ok}, error=${errorCaught}`,
        });
      }
    }
  }

  // Test 6: Missing capability keys block onboarding
  {
    const name = `missing-cap-${Date.now()}`;
    const payload: TenantOnboardingRequest = {
      tenant: {
        name: "Missing Cap Test",
        slug: name,
        timezone: "America/Argentina/Buenos_Aires",
        currency: "ARS",
        fuelUnit: "liters",
      },
      admin: {
        email: `admin-${name}@test.local`,
        temporaryPassword: "temp123",
        fullName: "Test Admin",
      },
    };

    // Temporarily remove a required capability to simulate incomplete catalog
    const { data: capToRestore } = await admin
      .from("capabilities")
      .select("id, key")
      .eq("key", "assignments:create")
      .single();

    if (capToRestore) {
      await admin.from("capabilities").delete().eq("id", capToRestore.id);

      const preflight = await runPreflightChecks(payload, preflightClients);
      let errorCaught = false;
      try {
        await runTenantOnboardingFlow(payload);
      } catch {
        errorCaught = true;
      }

      // Restore the capability
      await admin
        .from("capabilities")
        .insert({
          id: capToRestore.id,
          key: "assignments:create",
          name: "Assignments Create",
          description: "Allows creating assignment records.",
        })
        .select();

      if (!preflight.ok && errorCaught) {
        results.push({
          name: "Missing capability keys block onboarding",
          passed: true,
          message: "✅ Missing capability correctly blocks onboarding via preflight",
        });
      } else {
        results.push({
          name: "Missing capability keys block onboarding",
          passed: false,
          message: `❌ Expected block but got: preflight=${preflight.ok}, error=${errorCaught}`,
        });
      }
    } else {
      results.push({
        name: "Missing capability keys block onboarding",
        passed: false,
        message: "❌ Could not find 'assignments:create' capability to remove for test",
      });
    }
  }

  return results;
}

async function runTest(): Promise<void> {
  console.log("🚀 Starting automated onboarding test suite...\n");

  // 1. Get Supabase local credentials automatically
  console.log("📡 Detecting Supabase local credentials...");
  const status = getSupabaseStatus();
  console.log(`   API URL: ${status.API_URL}`);
  console.log(`   Service Role Key: ${status.SERVICE_ROLE_KEY.slice(0, 20)}...`);

  // Set environment variables for the onboarding flow
  process.env["SUPABASE_URL"] = status.API_URL;
  process.env["SUPABASE_SERVICE_ROLE_KEY"] = status.SERVICE_ROLE_KEY;

  const admin = createSupabaseClient(status.API_URL, status.SERVICE_ROLE_KEY);

  // 2. Run preflight checks first
  console.log("\n🔍 Running preflight checks for positive flow...");
  const { runPreflightChecks, buildIdempotencyMarkers } = await import(
    "./create-tenant-with-admin"
  );

  const preflightClients = {
    tenantSlugExists: async (slug: string) => {
      const { count } = await admin
        .from("tenants")
        .select("id", { count: "exact", head: true })
        .eq("slug", slug);
      return (count ?? 0) > 0;
    },
    localProfileExistsByEmail: async (email: string) => {
      const { count } = await admin
        .from("user_profiles")
        .select("id", { count: "exact", head: true })
        .eq("email", email);
      return (count ?? 0) > 0;
    },
    authIdentityExistsByEmail: async (email: string) => {
      const normalized = email.toLowerCase();
      let page = 1;
      const perPage = 200;
      while (true) {
        const response = await admin.auth.admin.listUsers({ page, perPage });
        const users = response.data?.users ?? [];
        const found = users.some(
          (item: { email?: string | null }) =>
            (item.email?.toLowerCase?.() ?? "") === normalized
        );
        if (found) return true;
        if (users.length < perPage) return false;
        page += 1;
      }
    },
    capabilityKeysExist: async (keys: readonly string[]) => {
      if (keys.length === 0) return new Set<string>();
      const { data } = await admin
        .from("capabilities")
        .select("key")
        .in("key", keys);
      return new Set((data ?? []).map((row: { key: string }) => row.key));
    },
  };

  const preflight = await runPreflightChecks(TEST_PAYLOAD, preflightClients);
  if (!preflight.ok) {
    console.error("❌ Preflight checks failed:");
    preflight.issues.forEach((issue) => {
      console.error(`   - ${issue.field}: ${issue.message}`);
    });
    console.error("\n💡 Tip: Make sure migrations are applied. Run: supabase migration up");
    process.exit(1);
  }
  console.log("   ✅ Preflight checks passed");

  // 3. Run onboarding flow
  console.log("\n🏗️  Running tenant onboarding flow...");
  console.log(`   Tenant: ${TEST_PAYLOAD.tenant.name}`);
  console.log(`   Admin: ${TEST_PAYLOAD.admin.email}`);

  let result: Awaited<ReturnType<typeof runTenantOnboardingFlow>>;
  try {
    result = await runTenantOnboardingFlow(TEST_PAYLOAD);
    console.log("   ✅ Onboarding flow completed");
  } catch (error) {
    console.error(
      `❌ Onboarding flow failed: ${error instanceof Error ? error.message : String(error)}`
    );
    await cleanupTestData(admin, TEST_TENANT_SLUG, TEST_ADMIN_EMAIL);
    process.exit(1);
  }

  // 4. Verify results
  console.log("\n🔎 Verifying persisted state...");
  const verificationResults = await verifyOnboardingResult(
    admin,
    TEST_TENANT_SLUG,
    TEST_ADMIN_EMAIL
  );

  const passed = verificationResults.filter((r) => r.ok);
  const failed = verificationResults.filter((r) => !r.ok);

  passed.forEach((r) => console.log(`   ${r.message}`));
  failed.forEach((r) => console.error(`   ❌ ${r.message}`));

  // 5. Negative flow tests
  console.log("\n🧪 Running negative flow tests...");
  const negativeResults = await runNegativeTests(admin);

  const negativePassed = negativeResults.filter((r) => r.passed);
  const negativeFailed = negativeResults.filter((r) => !r.passed);

  negativePassed.forEach((r) => console.log(`   ✅ ${r.name}`));
  negativeFailed.forEach((r) => console.error(`   ❌ ${r.name}: ${r.message}`));

  // 6. Cleanup positive flow
  await cleanupTestData(admin, TEST_TENANT_SLUG, TEST_ADMIN_EMAIL);

  // 7. Report
  const totalPassed = passed.length + negativePassed.length;
  const totalFailed = failed.length + negativeFailed.length;
  const totalTests = verificationResults.length + negativeResults.length;

  console.log("\n" + "=".repeat(50));
  if (totalFailed > 0) {
    console.error(`❌ TEST SUITE FAILED: ${totalFailed} test(s) failed`);
    console.error(`   Passed: ${totalPassed}/${totalTests}`);
    console.error(`\n   Positive flow: ${passed.length}/${verificationResults.length} passed`);
    console.error(`   Negative flow: ${negativePassed.length}/${negativeResults.length} passed`);
    process.exit(1);
  } else {
    console.log(`✅ TEST SUITE PASSED: All ${totalTests} tests passed`);
    console.log(`\n   Positive flow: ${passed.length}/${verificationResults.length} passed`);
    console.log(`   Negative flow: ${negativePassed.length}/${negativeResults.length} passed`);
    console.log(`\n   Tenant ID: ${result.tenantId}`);
    console.log(`   Auth User ID: ${result.authUserId}`);
    console.log(`   Profile ID: ${result.profileId}`);
    console.log(`   Roles Created: ${result.roleCount}`);
    process.exit(0);
  }
}

void runTest().catch((error) => {
  console.error(`💥 Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
