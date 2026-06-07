import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Factorías de clientes Supabase usadas por Web.
 */

export function createWebSupabaseClient(): SupabaseClient {
  // Cliente anónimo para operaciones de auth/login en contexto browser-like.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase env vars are missing");
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export function createWebSupabaseServiceClient(): SupabaseClient {
  // Cliente service-role para acciones administrativas server-side del API.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("Supabase service env vars are missing");
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
