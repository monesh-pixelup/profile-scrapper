import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export const NOT_CONFIGURED = {
  error: "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.",
};

// Returns an error response when Supabase is missing, otherwise null.
export function requireDb(): NextResponse | null {
  return isSupabaseConfigured() ? null : NextResponse.json(NOT_CONFIGURED, { status: 503 });
}

// Shared-secret check for senders (Apify webhooks, the Chrome extension).
// Accepts `Authorization: Bearer <secret>` or `x-ingest-secret: <secret>`.
export function requireIngestSecret(request: Request): NextResponse | null {
  const secret = process.env.INGEST_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "INGEST_SECRET is not set on the server." }, { status: 503 });
  }
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const header = request.headers.get("x-ingest-secret");
  if (bearer !== secret && header !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status: 500 });
}
