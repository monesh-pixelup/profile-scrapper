import { getSupabase } from "@/lib/supabase/server";
import { commentQuality, filterNoise, icpGate, type IngestRecord } from "./gate";
import {
  SIGNAL_SOURCES,
  type ConfigGroup,
  type ConfigRow,
  type Lead,
  type LeadStatus,
  type Run,
  type Runner,
  type Signal,
  type SignalSource,
  type Source,
  type SourceType,
} from "./model";

function db() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

const IN_CHUNK = 200;
const SELECT_CHUNK = 500;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const normHandle = (h: string) => h.trim().replace(/^@/, "").replace(/^https?:\/\/(x|twitter)\.com\//i, "").toLowerCase();

// ---------------------------------------------------------------- reads --

interface SignalRow {
  source: SignalSource;
  source_ref: string;
  detail: string | null;
  captured_at: string;
  captured_by: Runner;
  comment_quality: "substantive" | null;
}

interface LeadRow {
  id: string;
  username: string;
  handle: string;
  name: string | null;
  description: string | null;
  location: string | null;
  followers: number;
  status: LeadStatus;
  notes: string | null;
  signals: SignalRow[];
}

// Leads that have at least one signal, newest activity first. Capped at
// 1000 rows (the PostgREST default page); add paging if it ever gets close.
export async function listOutreachLeads(): Promise<Lead[]> {
  const supabase = db();
  const [{ data, error }, clients] = await Promise.all([
    supabase
      .from("icp_leads")
      .select(
        "id, username, handle, name, description, location, followers, status, notes, signals(source, source_ref, detail, captured_at, captured_by, comment_quality)"
      )
      .gt("signal_count", 0)
      .order("latest_signal_at", { ascending: false })
      .limit(1000),
    listClientHandles(),
  ]);
  if (error) throw new Error(error.message);

  const clientSet = new Set(clients);
  return ((data ?? []) as unknown as LeadRow[]).map((row) => ({
    id: row.id,
    handle: row.handle,
    name: row.name || row.handle,
    bio: row.description ?? "",
    followers: row.followers,
    location: row.location ?? "",
    status: row.status,
    notes: row.notes ?? "",
    isClient: clientSet.has(row.username),
    signals: row.signals
      .map<Signal>((s) => ({
        source: s.source,
        ref: s.source_ref,
        detail: s.detail ?? "",
        at: s.captured_at,
        by: s.captured_by,
        ...(s.comment_quality ? { quality: s.comment_quality } : {}),
      }))
      .sort((a, b) => a.at.localeCompare(b.at)),
  }));
}

export async function listClientHandles(): Promise<string[]> {
  const { data, error } = await db().from("previous_clients").select("handle").order("handle");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.handle as string);
}

export async function listSources(): Promise<Source[]> {
  const supabase = db();
  const [{ data, error }, clients] = await Promise.all([
    supabase.from("sources").select("handle, type, active, last_run_at, anchor_ids").order("handle"),
    listClientHandles(),
  ]);
  if (error) throw new Error(error.message);

  const monitored: Source[] = (data ?? []).map((r) => ({
    handle: r.handle,
    type: r.type as SourceType,
    active: r.active,
    lastRunAt: r.last_run_at,
    anchors: Array.isArray(r.anchor_ids) ? r.anchor_ids.length : 0,
  }));
  const clientRows: Source[] = clients.map((handle) => ({
    handle,
    type: "client",
    active: false,
    lastRunAt: null,
    anchors: 0,
  }));
  return [...monitored, ...clientRows];
}

export async function listRuns(limit = 100): Promise<Run[]> {
  const { data, error } = await db()
    .from("runs")
    .select("id, source, runner, started_at, records_received, new_leads, new_signals, errors, flags, cost_usd")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    source: r.source as SignalSource,
    runner: r.runner as Runner,
    startedAt: r.started_at,
    received: r.records_received,
    newLeads: r.new_leads,
    newSignals: r.new_signals,
    errors: r.errors,
    flags: r.flags ?? [],
    cost: r.cost_usd === null ? null : Number(r.cost_usd),
  }));
}

export async function listConfig(): Promise<ConfigRow[]> {
  const { data, error } = await db().from("config").select("key, value, group_name, hint").order("key");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    key: r.key,
    value: r.value,
    group: r.group_name as ConfigGroup,
    hint: r.hint,
  }));
}

export async function getConfigMap(): Promise<Record<string, string>> {
  const rows = await listConfig();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

// -------------------------------------------------------------- writes --

export async function addSource(handle: string, type: SourceType): Promise<void> {
  const h = normHandle(handle);
  if (!h) throw new Error("Handle is required");
  const { error } = await db()
    .from("sources")
    .upsert({ handle: h, type, active: true }, { onConflict: "handle", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

export async function setSourceActive(handle: string, active: boolean): Promise<void> {
  const { error } = await db().from("sources").update({ active }).eq("handle", normHandle(handle));
  if (error) throw new Error(error.message);
}

// Config values are free text; unknown keys are only allowed for pillar
// pause flags so a typo cannot create stray settings.
export async function updateConfig(values: Record<string, string>): Promise<void> {
  const supabase = db();
  const { data, error } = await supabase.from("config").select("key");
  if (error) throw new Error(error.message);
  const known = new Set((data ?? []).map((r) => r.key as string));

  for (const [key, value] of Object.entries(values)) {
    if (known.has(key)) {
      const { error: e } = await supabase.from("config").update({ value: String(value) }).eq("key", key);
      if (e) throw new Error(e.message);
    } else if (key.startsWith("pillar_paused_") && SIGNAL_SOURCES.includes(key.slice(14) as SignalSource)) {
      const { error: e } = await supabase
        .from("config")
        .upsert({ key, value: String(value), group_name: "Pillars", hint: "Pillar paused flag" });
      if (e) throw new Error(e.message);
    } else {
      throw new Error(`Unknown config key: ${key}`);
    }
  }
}

export interface IngestInput {
  source: SignalSource;
  runner: Runner;
  records: IngestRecord[];
  startedAt?: string;
  // Sender-reported flags, e.g. anchor_not_found.
  flags?: string[];
  errors?: number;
  costUsd?: number;
}

export interface IngestResult {
  received: number;
  accepted: number;
  newLeads: number;
  newSignals: number;
  runId: string | null;
}

// Idempotent: leads are keyed on username and signals on
// (lead, source, source_ref), so replaying a payload adds nothing. Existing
// leads are never modified here, which keeps first-signal fields and human
// edits (status, notes) intact.
export async function ingest(input: IngestInput): Promise<IngestResult> {
  const supabase = db();
  const config = await getConfigMap();

  const flags = [...(input.flags ?? [])];
  const cleaned = input.records
    .filter((r) => r && typeof r.handle === "string" && r.handle.trim() && r.source_ref)
    .map((r) => ({ ...r, handle: normHandle(r.handle) }));
  const filtered = icpGate(input.source, filterNoise(input.source, cleaned, config), config);
  if (filtered.length < cleaned.length) flags.push(`filtered_${cleaned.length - filtered.length}`);

  // One lead per handle in the batch.
  const byHandle = new Map<string, IngestRecord>();
  for (const r of filtered) if (!byHandle.has(r.handle)) byHandle.set(r.handle, r);
  const handles = [...byHandle.keys()];

  const existing = new Set<string>();
  for (const batch of chunk(handles, IN_CHUNK)) {
    const { data, error } = await supabase.from("icp_leads").select("username").in("username", batch);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) existing.add(row.username as string);
  }

  const fresh = handles
    .filter((h) => !existing.has(h))
    .map((h) => {
      const r = byHandle.get(h)!;
      return {
        username: h,
        handle: r.handle,
        name: r.name || null,
        description: r.bio || null,
        profile_picture: r.profile_picture || null,
        location: r.location || null,
        followers: r.followers ?? 0,
        following: r.following ?? 0,
        x_user_id: r.x_user_id || null,
      };
    });
  for (const batch of chunk(fresh, SELECT_CHUNK)) {
    const { error } = await supabase
      .from("icp_leads")
      .upsert(batch, { onConflict: "username", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }

  const ids = new Map<string, string>();
  for (const batch of chunk(handles, IN_CHUNK)) {
    const { data, error } = await supabase.from("icp_leads").select("id, username").in("username", batch);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) ids.set(row.username as string, row.id as string);
  }

  const signalRows = filtered
    .filter((r) => ids.has(r.handle))
    .map((r) => ({
      lead_id: ids.get(r.handle)!,
      source: input.source,
      source_ref: r.source_ref,
      detail: r.detail ?? null,
      captured_at: r.captured_at ?? new Date().toISOString(),
      captured_by: input.runner,
      comment_quality: commentQuality(input.source, r) ?? null,
    }));

  // Same lead + source + ref twice in one batch would collide inside a single
  // upsert, so drop the repeats first.
  const seen = new Set<string>();
  const uniqueSignals = signalRows.filter((s) => {
    const key = `${s.lead_id}|${s.source}|${s.source_ref}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  let newSignals = 0;
  for (const batch of chunk(uniqueSignals, SELECT_CHUNK)) {
    // With ignoreDuplicates, only the rows actually inserted come back.
    const { data, error } = await supabase
      .from("signals")
      .upsert(batch, { onConflict: "lead_id,source,source_ref", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(error.message);
    newSignals += data?.length ?? 0;
  }

  const { data: run, error: runError } = await supabase
    .from("runs")
    .insert({
      source: input.source,
      runner: input.runner,
      started_at: input.startedAt ?? new Date().toISOString(),
      records_received: input.records.length,
      new_leads: fresh.length,
      new_signals: newSignals,
      errors: input.errors ?? 0,
      flags,
      cost_usd: input.costUsd ?? null,
    })
    .select("id")
    .single();
  if (runError) throw new Error(runError.message);

  // Source bookkeeping: stamp last_run_at on the account scraped.
  const refs = [...new Set(filtered.map((r) => normHandle(r.source_ref)))];
  if (refs.length > 0) {
    await supabase.from("sources").update({ last_run_at: new Date().toISOString() }).in("handle", refs);
  }

  return {
    received: input.records.length,
    accepted: filtered.length,
    newLeads: fresh.length,
    newSignals,
    runId: run?.id ?? null,
  };
}
