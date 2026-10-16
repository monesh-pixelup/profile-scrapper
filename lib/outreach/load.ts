import { isSupabaseConfigured } from "@/lib/supabase/server";
import { listConfig, listOutreachLeads, listRuns, listSources } from "./store";
import type { ConfigRow, Lead, Run, Source } from "./model";

export interface OutreachData {
  ready: boolean;
  // Why the data is empty: missing env vars, or a failed query (usually the
  // 003 migration has not been applied yet).
  problem: "not_configured" | "query_failed" | null;
  message: string | null;
  leads: Lead[];
  runs: Run[];
  sources: Source[];
  config: ConfigRow[];
  configMap: Record<string, string>;
}

const EMPTY: OutreachData = {
  ready: false,
  problem: null,
  message: null,
  leads: [],
  runs: [],
  sources: [],
  config: [],
  configMap: {},
};

// Server-only. Call `await connection()` first in the page so the result is
// never prerendered at build time.
export async function loadOutreach(): Promise<OutreachData> {
  if (!isSupabaseConfigured()) {
    return { ...EMPTY, problem: "not_configured", message: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY." };
  }
  try {
    const [leads, runs, sources, config] = await Promise.all([
      listOutreachLeads(),
      listRuns(),
      listSources(),
      listConfig(),
    ]);
    return {
      ready: true,
      problem: null,
      message: null,
      leads,
      runs,
      sources,
      config,
      configMap: Object.fromEntries(config.map((c) => [c.key, c.value])),
    };
  } catch (error) {
    return {
      ...EMPTY,
      problem: "query_failed",
      message: error instanceof Error ? error.message : "Query failed",
    };
  }
}
