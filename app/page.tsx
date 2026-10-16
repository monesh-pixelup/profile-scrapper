import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { PillarStatus } from "@/components/PillarStatus";
import { SetupNotice } from "@/components/SetupNotice";
import { Card, Label, RunnerTag, Sparkline, StatusPill, Tag } from "@/components/ui";
import { daysBack, pillarState, signalsPerDay } from "@/lib/outreach/derive";
import { loadOutreach } from "@/lib/outreach/load";
import {
  fmtCount,
  fmtDateTime,
  latestSignal,
  PILLAR_BY_SOURCE,
  PILLARS,
  pillarStats,
  STATUS_LABELS,
} from "@/lib/outreach/model";

async function OverviewContent() {
  await connection();
  const data = await loadOutreach();
  const { leads, runs } = data;

  const days = daysBack(14);
  const perDay = signalsPerDay(leads, days);
  const max = Math.max(...perDay, 1);
  const weekStart = days[days.length - 7];
  const signals = leads.flatMap((l) => l.signals);
  const newThisWeek = leads.filter((l) => l.signals[0].at.slice(0, 10) >= weekStart).length;
  const signalsThisWeek = signals.filter((s) => s.at.slice(0, 10) >= weekStart).length;
  const multi = leads.filter((l) => l.signals.length > 1);
  const untouched = leads.filter((l) => l.status === "new");
  const topLeads = [...leads]
    .sort((a, b) => b.signals.length - a.signals.length || b.followers - a.followers)
    .slice(0, 7);
  const states = PILLARS.map((p) => ({ p, ...pillarState(p, runs, data.configMap) }));
  const attention = states.filter((s) => s.status !== "active");
  const pillarTotals = PILLARS.map((p) => ({ p, ...pillarStats(leads, p.source) }));
  const maxSignals = Math.max(...pillarTotals.map((x) => x.signals), 1);

  const kpis = [
    { label: "Total leads", value: leads.length, delta: `+${newThisWeek} this week`, data: perDay },
    { label: "Signals captured", value: signals.length, delta: `+${signalsThisWeek} this week`, data: perDay },
    { label: "Multi-signal leads", value: multi.length, delta: "Surfaced by 2+ pillars", data: perDay },
    { label: "Untouched", value: untouched.length, delta: "Status: new", data: perDay },
  ];

  return (
    <div className="space-y-6 p-[30px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.8rem] leading-tight tracking-[-0.03em]">Overview</h1>
          <p className="mt-1 text-sm text-zinc-400">Signal activity across all pillars</p>
        </div>
        <span className="border border-zinc-700 px-3 py-2 font-mono text-[0.76rem] uppercase tracking-[0.06em] text-zinc-400">
          Last 14 days
        </span>
      </div>

      <SetupNotice data={data} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-5">
            <Label>{k.label}</Label>
            <p className="mt-3 font-display text-[2.2rem] leading-none tracking-[-0.03em] tabular-nums">{k.value}</p>
            <p className="mt-2 text-xs text-zinc-400">{k.delta}</p>
            <Sparkline data={k.data} className="mt-4" />
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card title="Signals per day" action={<Label>Last 14 days</Label>}>
          <div className="p-5">
            <div className="flex h-48 items-end gap-2" role="img" aria-label="Bar chart of signals captured per day">
              {perDay.map((v, i) => (
                <div key={days[i]} className="relative flex h-full flex-1 flex-col justify-end">
                  <span className="mb-1 text-center font-mono text-[0.65rem] text-zinc-500 tabular-nums">{v || ""}</span>
                  <div className="bg-brand" style={{ height: `${(v / max) * 100}%`, minHeight: v ? 3 : 1, opacity: v ? 1 : 0.25 }} />
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              {days.map((d) => (
                <span key={d} className="flex-1 text-center font-mono text-[0.65rem] text-zinc-500">
                  {d.slice(8)}
                </span>
              ))}
            </div>
          </div>
        </Card>

        <Card title="Signals by pillar">
          <ul className="space-y-4 p-5">
            {pillarTotals.map(({ p, signals: n, leads: l }) => (
              <li key={p.slug}>
                <Link href={`/signals/${p.slug}`} className="group block">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="group-hover:underline">{p.name}</span>
                    <span className="font-mono text-[0.76rem] text-zinc-400 tabular-nums">
                      {n} · {l} leads
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 bg-zinc-800">
                    <div className="h-full bg-brand" style={{ width: `${(n / maxSignals) * 100}%` }} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card title="Top leads" action={<Link href="/leads" className="font-mono text-[0.76rem] uppercase text-zinc-400 hover:text-white">View all →</Link>}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400">
                  {["Lead", "Signals", "Latest pillar", "Status"].map((h) => (
                    <th key={h} className="px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {topLeads.map((l) => (
                  <tr key={l.id} className="border-b border-zinc-800 last:border-0 hover:bg-zinc-900">
                    <td className="px-5 py-3">
                      <p className="font-medium">{l.name}</p>
                      <p className="text-xs text-zinc-500">@{l.handle} · {fmtCount(l.followers)}</p>
                    </td>
                    <td className="px-5 py-3 tabular-nums">{l.signals.length}</td>
                    <td className="px-5 py-3"><Tag marker>{PILLAR_BY_SOURCE[latestSignal(l).source].name}</Tag></td>
                    <td className="px-5 py-3"><StatusPill status={l.status} label={STATUS_LABELS[l.status]} /></td>
                  </tr>
                ))}
                {topLeads.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-zinc-500">
                      No leads yet. Send a batch to /api/outreach/ingest.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Needs attention">
            {attention.length === 0 ? (
              <p className="p-5 text-sm text-zinc-500">All pillars healthy.</p>
            ) : (
              <ul>
                {attention.map(({ p, status, note }) => (
                  <li key={p.slug} className="border-b border-zinc-800 px-5 py-4 last:border-0">
                    <Link href={`/signals/${p.slug}`} className="flex items-center justify-between gap-3">
                      <span className="text-sm hover:underline">{p.name}</span>
                      <PillarStatus status={status} />
                    </Link>
                    {note && <p className="mt-1 text-xs text-zinc-500">{note}</p>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Recent runs" action={<Link href="/runs" className="font-mono text-[0.76rem] uppercase text-zinc-400 hover:text-white">All →</Link>}>
            {runs.length === 0 ? (
              <p className="p-5 text-sm text-zinc-500">No runs logged yet.</p>
            ) : (
              <ul>
                {runs.slice(0, 4).map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 py-3 last:border-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm">{PILLAR_BY_SOURCE[r.source].name}</p>
                      <p className="text-xs text-zinc-500">{fmtDateTime(r.startedAt)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <RunnerTag runner={r.runner} />
                      <span className="font-mono text-[0.76rem] text-zinc-400 tabular-nums">+{r.newLeads}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}


export default function Overview() {
  return (
    <Suspense fallback={<div className="p-[30px] text-sm text-zinc-500">Loading…</div>}>
      <OverviewContent />
    </Suspense>
  );
}
