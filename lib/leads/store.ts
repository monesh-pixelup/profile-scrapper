import { after } from "next/server";
import { getSupabase } from "@/lib/supabase/server";
import { scoreProfile } from "@/lib/icp/score";
import type { TwitterUser } from "@/lib/twitter/types";
import { LEAD_STATUSES, type Lead, type LeadPatch, type LeadSource } from "./types";

const TABLE = "icp_leads";

// Profiles scoring at or above this are auto-saved as ICP leads. Defaults to
// the "✅ GOOD FIT" tier boundary in lib/icp/score.ts.
const DEFAULT_ICP_MIN_SCORE = 50;

export function getIcpMinScore(): number {
  const parsed = Number(process.env.ICP_MIN_SCORE);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_ICP_MIN_SCORE;
}

// Postgres `in (...)` lists are sent in the URL, so keep them bounded.
const IN_CHUNK_SIZE = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// Scraper-owned columns only — outreach tracking columns are deliberately
// absent so re-scraping a lead never resets its progress.
function profileColumns(user: TwitterUser) {
  const icp = scoreProfile(user);
  return {
    username: user.userName.toLowerCase(),
    handle: user.userName,
    name: user.name || null,
    description: user.description || null,
    profile_picture: user.profilePicture || null,
    location: user.location || null,
    followers: user.followers ?? 0,
    following: user.following ?? 0,
    icp_score: icp.score,
    icp_tag: icp.tag,
    icp_signals: icp.signals,
    last_seen_at: new Date().toISOString(),
  };
}

function dedupeUsers(users: TwitterUser[]): TwitterUser[] {
  const seen = new Set<string>();
  return users.filter((user) => {
    if (!user?.userName) return false;
    const key = user.userName.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Persists every profile scoring >= ICP_MIN_SCORE. New leads get their
// source recorded; existing leads only get their profile/score refreshed.
// Returns how many qualifying leads were written (0 when Supabase isn't
// configured).
export async function saveIcpLeads(users: TwitterUser[], source: LeadSource): Promise<number> {
  const supabase = getSupabase();
  if (!supabase) return 0;

  const minScore = getIcpMinScore();
  const rows = dedupeUsers(users)
    .map(profileColumns)
    .filter((row) => row.icp_score >= minScore);
  if (rows.length === 0) return 0;

  const existing = new Set<string>();
  for (const batch of chunk(rows, IN_CHUNK_SIZE)) {
    const { data, error } = await supabase
      .from(TABLE)
      .select("username")
      .in(
        "username",
        batch.map((row) => row.username)
      );
    if (error) throw new Error(`Supabase lookup failed: ${error.message}`);
    for (const row of data ?? []) existing.add(row.username);
  }

  const newRows = rows
    .filter((row) => !existing.has(row.username))
    .map((row) => ({ ...row, source_type: source.type, source_ref: source.ref ?? null }));
  const existingRows = rows.filter((row) => existing.has(row.username));

  if (newRows.length > 0) {
    // ignoreDuplicates covers a concurrent scrape inserting the same lead
    // between the lookup above and this insert.
    const { error } = await supabase
      .from(TABLE)
      .upsert(newRows, { onConflict: "username", ignoreDuplicates: true });
    if (error) throw new Error(`Supabase insert failed: ${error.message}`);
  }

  if (existingRows.length > 0) {
    const { error } = await supabase.from(TABLE).upsert(existingRows, { onConflict: "username" });
    if (error) throw new Error(`Supabase update failed: ${error.message}`);
  }

  return rows.length;
}

// Fire-and-forget wrapper for API routes: runs after the response is sent so
// a slow or failing database never delays or breaks a scrape.
export function saveIcpLeadsAfterResponse(users: TwitterUser[], source: LeadSource): void {
  if (!getSupabase()) return;
  after(async () => {
    try {
      await saveIcpLeads(users, source);
    } catch (error) {
      console.error("[leads] failed to save ICP leads", error);
    }
  });
}

export async function listLeads(): Promise<Lead[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("icp_score", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw new Error(error.message);
  return (data ?? []) as Lead[];
}

// Manually adds (or re-adds) a profile, bypassing the ICP_MIN_SCORE filter —
// used by the "+ Target" buttons in the scraper tables.
export async function upsertManualLead(
  user: TwitterUser,
  options: { inTargetList: boolean; source?: LeadSource }
): Promise<Lead> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase is not configured");

  const columns = profileColumns(user);
  const { data: existing, error: lookupError } = await supabase
    .from(TABLE)
    .select("id")
    .eq("username", columns.username)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);

  const row = existing
    ? { ...columns, in_target_list: options.inTargetList }
    : {
        ...columns,
        in_target_list: options.inTargetList,
        source_type: options.source?.type ?? "manual",
        source_ref: options.source?.ref ?? null,
      };

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(row, { onConflict: "username" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data as Lead;
}

// Whitelists dashboard-editable fields and keeps reached_out_at in sync
// with the reached_out checkbox.
export function sanitizePatch(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  const patch: Record<string, unknown> = {};

  if (typeof raw.in_target_list === "boolean") patch.in_target_list = raw.in_target_list;
  if (typeof raw.reached_out === "boolean") {
    patch.reached_out = raw.reached_out;
    patch.reached_out_at = raw.reached_out ? new Date().toISOString() : null;
  }
  if (typeof raw.status === "string" && (LEAD_STATUSES as readonly string[]).includes(raw.status)) {
    patch.status = raw.status;
  }
  if (raw.notes === null || typeof raw.notes === "string") {
    patch.notes = typeof raw.notes === "string" && raw.notes.trim() ? raw.notes.slice(0, 5000) : null;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

export async function updateLeads(ids: string[], patch: LeadPatch | Record<string, unknown>): Promise<Lead[]> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase is not configured");

  const { data, error } = await supabase.from(TABLE).update(patch).in("id", ids).select("*");
  if (error) throw new Error(error.message);
  return (data ?? []) as Lead[];
}

export async function deleteLeads(ids: string[]): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase is not configured");

  const { error } = await supabase.from(TABLE).delete().in("id", ids);
  if (error) throw new Error(error.message);
}
