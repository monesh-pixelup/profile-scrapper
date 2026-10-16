import { NextResponse, connection } from "next/server";
import { errorResponse, requireDb } from "@/lib/outreach/api";
import { listConfig, updateConfig } from "@/lib/outreach/store";

export async function GET() {
  await connection();
  const denied = requireDb();
  if (denied) return denied;
  try {
    return NextResponse.json({ config: await listConfig() });
  } catch (error) {
    return errorResponse(error, "Failed to load config");
  }
}

// { values: { key: "value", ... } }. Takes effect on the next run.
export async function PUT(request: Request) {
  const denied = requireDb();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { values?: Record<string, unknown> } | null;
  if (!body?.values || typeof body.values !== "object") {
    return NextResponse.json({ error: "values object is required" }, { status: 400 });
  }
  const values = Object.fromEntries(Object.entries(body.values).map(([k, v]) => [k, String(v)]));
  try {
    await updateConfig(values);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof Error && error.message.startsWith("Unknown config key") ? 400 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed" }, { status });
  }
}
