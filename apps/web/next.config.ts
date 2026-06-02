import type { NextConfig } from "next";

function validateEnv() {
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  ];
  const missing: string[] = [];
  for (const key of required) {
    const value = process.env[key];
    if (!value || value.includes("placeholder")) {
      missing.push(key);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `[CRITICAL CONFIG ERROR] Missing or invalid required environment variables: ${missing.join(", ")}\n` +
        `Build cannot proceed. Please configure the variables for the current environment.`
    );
  }
}

validateEnv();

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
