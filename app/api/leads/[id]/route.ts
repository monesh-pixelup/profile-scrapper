import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { deleteLeads, sanitizePatch, updateLeads } from "@/lib/leads/store";

const NOT_CONFIGURED = {
  error: "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.",
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return NextResponse.json(NOT_CONFIGURED, { status: 503 });
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch = sanitizePatch(body);
  if (!patch) return NextResponse.json({ error: "No editable fields in request body" }, { status: 400 });

  try {
    const [lead] = await updateLeads([id], patch);
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    return NextResponse.json({ lead });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update lead";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return NextResponse.json(NOT_CONFIGURED, { status: 503 });
  const { id } = await params;

  try {
    await deleteLeads([id]);
    return NextResponse.json({ deleted: 1 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete lead";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
