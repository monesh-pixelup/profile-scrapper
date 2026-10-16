import { Suspense } from "react";
import { connection } from "next/server";
import { SetupNotice } from "@/components/SetupNotice";
import { PageHeader, RunnerTag } from "@/components/ui";
import { loadOutreach } from "@/lib/outreach/load";
import { fmtDateTime, PILLAR_BY_SOURCE } from "@/lib/outreach/model";

async function RunsPageContent() {
  await connection();
  const data = await loadOutreach();
  const runs = data.runs;

  return (
    <>
      <PageHeader
        label="Run log"
        title="What each run did"
        sub="Every run writes a row: how many records arrived, how many were new, and any flags like anchor_not_found. Use it to track cost per lead."
      />
      {!data.ready && (
        <div className="px-[30px] pt-6">
          <SetupNotice data={data} />
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-400">
              {["Pillar", "Runner", "Started", "Received", "New leads", "New signals", "Errors", "Cost", "Flags"].map((h) => (
                <th key={h} className="px-[15px] py-4 first:pl-[30px]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-b border-zinc-800 hover:bg-zinc-900">
                <td className="px-[15px] py-4 pl-[30px] font-display text-[1.05rem]">{PILLAR_BY_SOURCE[r.source]?.name ?? r.source}</td>
                <td className="px-[15px] py-4">
                  <RunnerTag runner={r.runner} />
                </td>
                <td className="px-[15px] py-4 whitespace-nowrap text-zinc-400">{fmtDateTime(r.startedAt)}</td>
                <td className="px-[15px] py-4 tabular-nums">{r.received}</td>
                <td className="px-[15px] py-4 tabular-nums">{r.newLeads}</td>
                <td className="px-[15px] py-4 tabular-nums">{r.newSignals}</td>
                <td className={`px-[15px] py-4 tabular-nums ${r.errors ? "text-red-400" : "text-zinc-500"}`}>{r.errors}</td>
                <td className="px-[15px] py-4 text-zinc-400 tabular-nums">{r.cost === null ? "n/a" : `$${r.cost.toFixed(2)}`}</td>
                <td className="px-[15px] py-4">
                  {r.flags.length === 0 ? (
                    <span className="text-zinc-600">none</span>
                  ) : (
                    r.flags.map((f) => (
                      <span key={f} className="mr-2 font-mono text-[0.7rem] uppercase text-red-400">
                        {f}
                      </span>
                    ))
                  )}
                </td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={9} className="px-[30px] py-12 text-zinc-500">
                  No runs logged yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}


export default function RunsPage() {
  return (
    <Suspense fallback={<div className="p-[30px] text-sm text-zinc-500">Loading…</div>}>
      <RunsPageContent />
    </Suspense>
  );
}
