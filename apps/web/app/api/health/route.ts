import { NextResponse } from "next/server";
import pkg from "../../../package.json";

export const dynamic = "force-dynamic";

type HealthCheckResult = "ok" | "error";

type HealthResponse = {
  status: "healthy" | "unhealthy";
  timestamp: string;
  checks: {
    app: "ok";
    database: HealthCheckResult;
  };
  build: {
    version: string;
    commit_sha?: string;
    deploy_id?: string;
  };
};

const DB_TIMEOUT_MS = 5000;

async function checkDatabase(): Promise<HealthCheckResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return "error";
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DB_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/tenants?select=id&limit=1`,
      {
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        signal: controller.signal,
      }
    );

    return response.ok ? "ok" : "error";
  } catch {
    return "error";
  } finally {
    clearTimeout(timeout);
  }
}

function getBuildInfo(): HealthResponse["build"] {
  const commitSha =
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    undefined;

  const deployId =
    process.env.NEXT_PUBLIC_VERCEL_DEPLOY_ID ??
    process.env.VERCEL_DEPLOYMENT_ID ??
    undefined;

  return {
    version: pkg.version,
    ...(commitSha && { commit_sha: commitSha }),
    ...(deployId && { deploy_id: deployId }),
  };
}

export async function GET(): Promise<NextResponse<HealthResponse>> {
  const database = await checkDatabase();
  const isHealthy = database === "ok";

  const body: HealthResponse = {
    status: isHealthy ? "healthy" : "unhealthy",
    timestamp: new Date().toISOString(),
    checks: {
      app: "ok",
      database,
    },
    build: getBuildInfo(),
  };

  return NextResponse.json(body, { status: isHealthy ? 200 : 503 });
}
