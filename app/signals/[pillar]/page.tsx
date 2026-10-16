import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PauseToggle, RunButton } from "@/components/PillarControls";
import { PillarStatus } from "@/components/PillarStatus";
import { Tabs } from "@/components/Tabs";
import { Card, Label, RunnerTag, StatusPill, Tag } from "@/components/ui";
import { SetupNotice } from "@/components/SetupNotice";
import { pillarState } from "@/lib/outreach/derive";
import { loadOutreach } from "@/lib/outreach/load";
import {
  fmtCount,
  fmtDateTime,
  leadsForSource,
  PILLARS,
  pillarStats,
  SOURCE_TYPE_LABELS,
  STATUS_LABELS,
} from "@/lib/outreach/model";

export function generateStaticParams() {
  return PILLARS.map((p) => ({ pillar: p.slug }));
}

const th = "px-5 py-3";
const td = "px-5 py-3";

async function PillarPageContent({ params }: { params: Promise<{ pillar: string }> }) {
  await connection();
  const { pillar: slug } = await params;
  const p = PILLARS.find((x) => x.slug === slug);
  if (!p) notFound();

  const data = await loadOutreach();
  const st = pillarStats(data.leads, p.source);
  const leads = leadsForSource(data.leads, p.source);
  const runs = data.runs.filter((r) => r.source === p.source);
  const sources = p.sourcesTab ? data.sources.filter((s) => s.type === p.sourcesTab) : [];
  const config = data.config.filter((c) => p.configKeys.includes(c.key));
  const state = pillarState(p, data.runs, data.configMap);

  const kpis = [
    { label: "Leads", value: String(st.leads) },
    { label: "Signals", value: String(st.signals) },
    { label: "Last run", value: state.lastRun ? fmtDateTime(state.lastRun.startedAt) : "Never" },
    { label: "Cadence", value: p.cadence },
  ];

  const overview = (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="space-y-4">
        <Card title="About">
          <div className="p-5">
            <p className="max-w-[68ch] text-[#cfcfcf]">{p.description}</p>
            {state.note && (
              <p className="mt-4 border-l-[3px] border-brand bg-zinc-900 px-4 py-3 text-sm text-zinc-300">{state.note}</p>
            )}
          </div>
        </Card>
        <Card title="How it runs">
          <ol className="p-5">
            {p.steps.map((s, i) => (
              <li key={s} className="grid grid-cols-[36px_1fr] py-2">
                <span className="font-mono text-[0.8rem] text-brand-hover">{String(i + 1).padStart(2, "0")}</span>
                <span className="max-w-[68ch] text-[#cfcfcf]">{s}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
      <div className="space-y-4">
        <Card title="Details">
          <dl>
            {[
              ["Method", <RunnerTag key="m" runner={p.runner} />],
              ["Cadence", p.cadence],
              ["Status", <PillarStatus key="s" status={state.status} />],
            ].map(([k, v]) => (
              <div key={k as string} className="grid grid-cols-[110px_1fr] items-center border-b border-zinc-800 px-5 py-3 last:border-0">
                <dt className="text-sm text-zinc-400">{k}</dt>
                <dd className="text-sm">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        {sources.length > 0 && (
          <Card
            title="Monitored accounts"
            action={<Link href="/sources" className="font-mono text-[0.76rem] uppercase text-zinc-400 hover:text-white">Manage →</Link>}
          >
            <div className="flex flex-wrap gap-2 p-5">
              {sources.map((s) => (
                <Tag key={s.handle} marker={s.active}>
                  @{s.handle} · {SOURCE_TYPE_LABELS[s.type]}
                </Tag>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );

  const leadsTab = (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-400">
              {["Lead", "Trigger", "Followers", "Other signals", "Status"].map((h) => (
                <th key={h} className={th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leads.map((l) => {
              const s = l.signals.find((x) => x.source === p.source)!;
              return (
                <tr key={l.id} className="border-b border-zinc-800 align-top last:border-0 hover:bg-zinc-900">
                  <td className={td}>
                    <p className="font-medium">{l.name}</p>
                    <p className="text-xs text-zinc-500">@{l.handle}</p>
                  </td>
                  <td className={`${td} max-w-[360px] text-[#cfcfcf]`}>
                    <p className="line-clamp-2">{s.detail}</p>
                    <p className="mt-1 text-xs text-zinc-500">{fmtDateTime(s.at)}</p>
                  </td>
                  <td className={`${td} tabular-nums`}>{fmtCount(l.followers)}</td>
                  <td className={`${td} tabular-nums`}>{l.signals.length - 1}</td>
                  <td className={td}><StatusPill status={l.status} label={STATUS_LABELS[l.status]} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );

  const runsTab = (
    <Card>
      {runs.length === 0 ? (
        <p className="p-5 text-sm text-zinc-500">No runs logged yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400">
                {["Started", "Received", "New leads", "New signals", "Cost", "Flags"].map((h) => (
                  <th key={h} className={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-zinc-800 last:border-0 hover:bg-zinc-900">
                  <td className={`${td} whitespace-nowrap text-zinc-400`}>{fmtDateTime(r.startedAt)}</td>
                  <td className={`${td} tabular-nums`}>{r.received}</td>
                  <td className={`${td} tabular-nums`}>{r.newLeads}</td>
                  <td className={`${td} tabular-nums`}>{r.newSignals}</td>
                  <td className={`${td} text-zinc-400`}>{r.cost === null ? "n/a" : `$${r.cost.toFixed(2)}`}</td>
                  <td className={td}>
                    {r.flags.length === 0
                      ? <span className="text-zinc-600">none</span>
                      : r.flags.map((f) => (
                          <span key={f} className="mr-2 font-mono text-[0.7rem] uppercase text-red-400">{f}</span>
                        ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );

  const configTab = (
    <Card
      title="Thresholds for this pillar"
      action={<Link href="/settings" className="font-mono text-[0.76rem] uppercase text-zinc-400 hover:text-white">Edit in settings →</Link>}
    >
      <dl>
        {config.map((c) => (
          <div key={c.key} className="grid grid-cols-[1fr_auto] gap-4 border-b border-zinc-800 px-5 py-3 last:border-0">
            <dt>
              <span className="font-mono text-[0.8rem]">{c.key}</span>
              <p className="text-xs text-zinc-500">{c.hint}</p>
            </dt>
            <dd className="font-mono text-[0.9rem]">{c.value || "not set"}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );

  return (
    <div className="space-y-6 p-[30px]">
      <SetupNotice data={data} />
      <div>
        <Link href="/signals" className="font-mono text-[0.76rem] uppercase tracking-[0.07em] text-zinc-400 hover:text-white">
          Signal pillars / {String(p.n).padStart(2, "0")}
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[1.8rem] leading-tight tracking-[-0.03em]">{p.name}</h1>
            <p className="mt-1 text-sm text-zinc-400">{p.short}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PillarStatus status={state.status} />
            <RunnerTag runner={p.runner} />
            <PauseToggle pillar={p} paused={state.status === "paused"} />
            <RunButton pillar={p} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-5">
            <Label>{k.label}</Label>
            <p className="mt-3 font-display text-[1.6rem] leading-tight tracking-[-0.02em] tabular-nums">{k.value}</p>
          </Card>
        ))}
      </div>

      <Tabs
        tabs={[
          { id: "overview", label: "Overview", content: overview },
          { id: "leads", label: "Leads", count: leads.length, content: leadsTab },
          { id: "runs", label: "Runs", count: runs.length, content: runsTab },
          { id: "config", label: "Thresholds", count: config.length, content: configTab },
        ]}
      />
    </div>
  );
}


export default function PillarPage(props: { params: Promise<{ pillar: string }> }) {
  return (
    <Suspense fallback={<div className="p-[30px] text-sm text-zinc-500">Loading…</div>}>
      <PillarPageContent {...props} />
    </Suspense>
  );
}
