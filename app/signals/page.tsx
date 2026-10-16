import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { PauseToggle, RunButton } from "@/components/PillarControls";
import { PillarStatus } from "@/components/PillarStatus";
import { SetupNotice } from "@/components/SetupNotice";
import { Card, Label, RunnerTag } from "@/components/ui";
import { pillarState } from "@/lib/outreach/derive";
import { loadOutreach } from "@/lib/outreach/load";
import { fmtDateTime, PILLARS, pillarStats, type Lead, type Pillar, type Run } from "@/lib/outreach/model";

function PillarCard({ p, leads, runs, config }: { p: Pillar; leads: Lead[]; runs: Run[]; config: Record<string, string> }) {
  const st = pillarStats(leads, p.source);
  const state = pillarState(p, runs, config);
  return (
    <Card className="flex flex-col">
      <div className="flex-1 p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[0.8rem] text-brand-hover">{String(p.n).padStart(2, "0")}</span>
          <PillarStatus status={state.status} />
        </div>
        <h2 className="mt-3 text-[1.25rem] leading-tight tracking-[-0.02em]">
          <Link href={`/signals/${p.slug}`} className="hover:underline">{p.name}</Link>
        </h2>
        <p className="mt-1 text-sm text-zinc-400">{p.short}</p>
        {state.note && <p className="mt-3 border-l-[3px] border-brand bg-zinc-900 px-3 py-2 text-xs text-zinc-300">{state.note}</p>}
        <dl className="mt-5 grid grid-cols-3 gap-4">
          {[["Leads", String(st.leads)], ["Signals", String(st.signals)], ["Cadence", p.cadence.split(",")[0]]].map(([k, v]) => (
            <div key={k}>
              <dt><Label>{k}</Label></dt>
              <dd className="mt-1 font-display text-lg tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-zinc-800 px-5 py-3">
        <RunnerTag runner={p.runner} />
        <span className="text-xs text-zinc-500">Last: {state.lastRun ? fmtDateTime(state.lastRun.startedAt) : "never"}</span>
        <div className="ml-auto flex gap-2">
          <PauseToggle pillar={p} paused={state.status === "paused"} />
          <RunButton pillar={p} />
        </div>
      </div>
    </Card>
  );
}

async function SignalsPageContent() {
  await connection();
  const data = await loadOutreach();
  const groups: [string, string, Pillar[]][] = [
    ["Automated", "Scheduled in Apify", PILLARS.filter((p) => p.runner === "apify")],
    ["Manual", "Run from the Chrome extension while logged in", PILLARS.filter((p) => p.runner === "extension")],
  ];
  const statuses = PILLARS.map((p) => pillarState(p, data.runs, data.configMap).status);
  const active = statuses.filter((s) => s === "active").length;
  const attention = statuses.filter((s) => s === "attention").length;
  const totalSignals = PILLARS.reduce((n, p) => n + pillarStats(data.leads, p.source).signals, 0);

  return (
    <div className="space-y-8 p-[30px]">
      <div>
        <h1 className="text-[1.8rem] leading-tight tracking-[-0.03em]">Signal pillars</h1>
        <p className="mt-1 text-sm text-zinc-400">Five touchpoints on X that feed one lead list.</p>
      </div>

      <SetupNotice data={data} />

      <div className="grid gap-4 sm:grid-cols-3">
        {[["Active pillars", `${active} / ${PILLARS.length}`], ["Need attention", String(attention)], ["Signals captured", String(totalSignals)]].map(([k, v]) => (
          <Card key={k} className="p-5">
            <Label>{k}</Label>
            <p className="mt-3 font-display text-[2rem] leading-none tracking-[-0.03em] tabular-nums">{v}</p>
          </Card>
        ))}
      </div>

      {groups.map(([title, sub, list]) => (
        <section key={title}>
          <div className="mb-4 flex items-baseline gap-3">
            <h2 className="font-sans text-[1rem] font-medium tracking-normal">{title}</h2>
            <span className="text-sm text-zinc-500">{sub}</span>
          </div>
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {list.map((p) => <PillarCard key={p.slug} p={p} leads={data.leads} runs={data.runs} config={data.configMap} />)}
          </div>
        </section>
      ))}
    </div>
  );
}


export default function SignalsPage() {
  return (
    <Suspense fallback={<div className="p-[30px] text-sm text-zinc-500">Loading…</div>}>
      <SignalsPageContent />
    </Suspense>
  );
}
