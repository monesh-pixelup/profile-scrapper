import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// supabase-js appends /rest/v1 itself, so strip it (and trailing slashes) if
// the REST endpoint was pasted instead of the bare project URL.
const SUPABASE_URL = process.env.SUPABASE_URL?.trim()
  .replace(/\/rest\/v1\/?$/, "")
  .replace(/\/+$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

// Server-only: uses the service role key, which bypasses RLS. Never import
// this from a client component. Returns null (rather than throwing) when
// the env vars aren't set yet, so scraping keeps working without a database
// and lead persistence just becomes a no-op.
export function getSupabase(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
