import { NextResponse, connection } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import {
  deleteLeads,
  getIcpMinScore,
  listLeads,
  sanitizePatch,
  updateLeads,
  upsertManualLead,
} from "@/lib/leads/store";
import type { LeadSource, LeadSourceType } from "@/lib/leads/types";
import type { TwitterUser } from "@/lib/twitter/types";

const NOT_CONFIGURED = {
  error: "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.",
};

const SOURCE_TYPES: LeadSourceType[] = [
  "follower",
  "following",
  "tweet_reply",
  "top_icp",
  "profile_scan",
  "daily_scrape",
  "manual",
];

function parseIds(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const ids = value.filter((id): id is string => typeof id === "string" && id.length > 0);
  return ids.length > 0 ? ids : null;
}

export async function GET() {
  // With cacheComponents on, a GET handler that doesn't touch request data
  // can be prerendered at build time — this must always read live rows.
  await connection();

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ configured: false, leads: [], minScore: getIcpMinScore() });
  }

  try {
    const leads = await listLeads();
    return NextResponse.json({ configured: true, leads, minScore: getIcpMinScore() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load leads";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Manually add a scraped profile (e.g. "+ Target" in the scraper tables).
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json(NOT_CONFIGURED, { status: 503 });

  let body: { user?: Partial<TwitterUser>; inTargetList?: unknown; source?: { type?: unknown; ref?: unknown } };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const user = body.user;
  if (!user || typeof user.userName !== "string" || !user.userName.trim()) {
    return NextResponse.json({ error: "Missing 'user.userName' in request body" }, { status: 400 });
  }

  const source: LeadSource | undefined =
    body.source && SOURCE_TYPES.includes(body.source.type as LeadSourceType)
      ? {
          type: body.source.type as LeadSourceType,
          ref: typeof body.source.ref === "string" ? body.source.ref : undefined,
        }
      : undefined;

  try {
    const lead = await upsertManualLead(
      {
        userName: user.userName.trim(),
        name: user.name ?? "",
        description: user.description ?? "",
        profilePicture: user.profilePicture ?? "",
        followers: Number(user.followers) || 0,
        following: Number(user.following) || 0,
        location: user.location,
      },
      { inTargetList: body.inTargetList !== false, source }
    );
    return NextResponse.json({ lead });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save lead";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Bulk update: { ids: string[], patch: LeadPatch }
export async function PATCH(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json(NOT_CONFIGURED, { status: 503 });

  let body: { ids?: unknown; patch?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ids = parseIds(body.ids);
  const patch = sanitizePatch(body.patch);
  if (!ids || !patch) {
    return NextResponse.json({ error: "Body must include non-empty 'ids' and a valid 'patch'" }, { status: 400 });
  }

  try {
    const leads = await updateLeads(ids, patch);
    return NextResponse.json({ leads });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update leads";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Bulk delete: { ids: string[] }
export async function DELETE(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json(NOT_CONFIGURED, { status: 503 });

  let body: { ids?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ids = parseIds(body.ids);
  if (!ids) return NextResponse.json({ error: "Body must include non-empty 'ids'" }, { status: 400 });

  try {
    await deleteLeads(ids);
    return NextResponse.json({ deleted: ids.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete leads";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
