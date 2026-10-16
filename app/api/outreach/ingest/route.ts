import { NextResponse } from "next/server";
import { errorResponse, requireDb, requireIngestSecret } from "@/lib/outreach/api";
import { SIGNAL_SOURCES, type Runner, type SignalSource } from "@/lib/outreach/model";
import { ingest } from "@/lib/outreach/store";
import type { IngestRecord } from "@/lib/outreach/gate";

// Senders post batches of about 100-200 records. The cap keeps one request
// well inside the function time limit; chunk larger pulls into several POSTs.
const MAX_RECORDS = 500;

// POST /api/outreach/ingest
// Headers: Authorization: Bearer $INGEST_SECRET
// Body: { source, runner, records: [...], flags?, errors?, startedAt?, costUsd? }
// Safe to call twice with the same payload: it adds no new rows.
export async function POST(request: Request) {
  const denied = requireIngestSecret(request) ?? requireDb();
  if (denied) return denied;

  let body: {
    source?: unknown;
    runner?: unknown;
    records?: unknown;
    flags?: unknown;
    errors?: unknown;
    startedAt?: unknown;
    costUsd?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!SIGNAL_SOURCES.includes(body.source as SignalSource)) {
    return NextResponse.json({ error: `source must be one of: ${SIGNAL_SOURCES.join(", ")}` }, { status: 400 });
  }
  if (body.runner !== "apify" && body.runner !== "extension") {
    return NextResponse.json({ error: "runner must be 'apify' or 'extension'" }, { status: 400 });
  }
  if (!Array.isArray(body.records)) {
    return NextResponse.json({ error: "records must be an array" }, { status: 400 });
  }
  if (body.records.length > MAX_RECORDS) {
    return NextResponse.json({ error: `Send at most ${MAX_RECORDS} records per request` }, { status: 413 });
  }

  try {
    const result = await ingest({
      source: body.source as SignalSource,
      runner: body.runner as Runner,
      records: body.records as IngestRecord[],
      flags: Array.isArray(body.flags) ? body.flags.filter((f): f is string => typeof f === "string") : [],
      errors: typeof body.errors === "number" ? body.errors : 0,
      startedAt: typeof body.startedAt === "string" ? body.startedAt : undefined,
      costUsd: typeof body.costUsd === "number" ? body.costUsd : undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error, "Ingest failed");
  }
}
