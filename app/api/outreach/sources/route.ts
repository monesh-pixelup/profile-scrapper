import { NextResponse, connection } from "next/server";
import { errorResponse, requireDb } from "@/lib/outreach/api";
import type { SourceType } from "@/lib/outreach/model";
import { addSource, listSources, setSourceActive } from "@/lib/outreach/store";

const TYPES: SourceType[] = ["own", "competitor", "vc", "designer"];

export async function GET() {
  await connection();
  const denied = requireDb();
  if (denied) return denied;
  try {
    return NextResponse.json({ sources: await listSources() });
  } catch (error) {
    return errorResponse(error, "Failed to load sources");
  }
}

// Add a monitored account: { handle, type }
export async function POST(request: Request) {
  const denied = requireDb();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { handle?: unknown; type?: unknown } | null;
  if (typeof body?.handle !== "string" || !TYPES.includes(body.type as SourceType)) {
    return NextResponse.json({ error: "handle and a valid type are required" }, { status: 400 });
  }
  try {
    await addSource(body.handle, body.type as SourceType);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Failed to add source");
  }
}

// Pause or resume: { handle, active }
export async function PATCH(request: Request) {
  const denied = requireDb();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { handle?: unknown; active?: unknown } | null;
  if (typeof body?.handle !== "string" || typeof body.active !== "boolean") {
    return NextResponse.json({ error: "handle and active are required" }, { status: 400 });
  }
  try {
    await setSourceActive(body.handle, body.active);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Failed to update source");
  }
}
