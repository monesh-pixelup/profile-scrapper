import {
  pillarPausedKey,
  type Lead,
  type Pillar,
  type PillarStatus,
  type Run,
} from "./model";

export interface PillarState {
  status: PillarStatus;
  lastRun: Run | null;
  note: string | null;
}

// Live pillar state from the run log and config. A pillar needs attention
// when its latest run reported errors or flags such as anchor_not_found.
export function pillarState(p: Pillar, runs: Run[], config: Record<string, string>): PillarState {
  const lastRun = runs.find((r) => r.source === p.source) ?? null;
  const paused = config[pillarPausedKey(p.source)] === "true";
  const problems = lastRun ? [...lastRun.flags.filter((f) => !f.startsWith("filtered_"))] : [];
  if (lastRun && lastRun.errors > 0) problems.push(`${lastRun.errors} error${lastRun.errors > 1 ? "s" : ""}`);

  return {
    status: paused ? "paused" : problems.length > 0 ? "attention" : "active",
    lastRun,
    note: problems.length > 0 ? `Last run flagged: ${problems.join(", ")}.` : paused ? "Paused." : null,
  };
}

export function daysBack(count: number, now = new Date()): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (count - 1 - i)));
    return d.toISOString().slice(0, 10);
  });
}

export function signalsPerDay(leads: Lead[], days: string[], filter?: (source: string) => boolean): number[] {
  const all = leads.flatMap((l) => l.signals).filter((s) => (filter ? filter(s.source) : true));
  return days.map((d) => all.filter((s) => s.at.startsWith(d)).length);
}
