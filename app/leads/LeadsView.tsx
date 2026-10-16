"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { chip, Label, StatusPill, Tag } from "@/components/ui";
import {
  fmtCount,
  fmtDateTime,
  firstSignal,
  latestSignal,
  PILLARS,
  PILLAR_BY_SOURCE,
  STATUS_LABELS,
  type Lead,
  type LeadStatus,
  type SignalSource,
} from "@/lib/outreach/model";

type Sort = "latest" | "signals" | "followers";

export function LeadsView({ leads }: { leads: Lead[] }) {
  const [source, setSource] = useState<SignalSource | "all">("all");
  const [multiOnly, setMultiOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("latest");
  const [openId, setOpenId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => (source === "all" ? true : l.signals.some((s) => s.source === source)))
      .filter((l) => (multiOnly ? l.signals.length > 1 : true))
      .filter((l) => (q ? `${l.name} ${l.handle} ${l.bio}`.toLowerCase().includes(q) : true))
      .sort((a, b) => {
        if (sort === "signals") return b.signals.length - a.signals.length;
        if (sort === "followers") return b.followers - a.followers;
        return latestSignal(b).at.localeCompare(latestSignal(a).at);
      });
  }, [leads, source, multiOnly, query, sort]);

  const open = leads.find((l) => l.id === openId) ?? null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-[30px] py-5">
        <button type="button" className={chip} aria-pressed={source === "all"} onClick={() => setSource("all")}>
          All
        </button>
        {PILLARS.map((p) => (
          <button
            key={p.source}
            type="button"
            className={chip}
            aria-pressed={source === p.source}
            onClick={() => setSource(p.source)}
          >
            {p.name}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-800 px-[30px] py-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, handle or bio"
          aria-label="Search leads"
          className="w-full max-w-xs px-4 py-[14px] text-sm outline-none sm:w-72"
        />
        <button type="button" className={chip} aria-pressed={multiOnly} onClick={() => setMultiOnly((v) => !v)}>
          Multi-signal only
        </button>
        <label className="ml-auto flex items-center gap-3">
          <Label>Sort</Label>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="px-3 py-[10px] text-sm uppercase outline-none"
          >
            <option value="latest">Latest signal</option>
            <option value="signals">Most signals</option>
            <option value="followers">Followers</option>
          </select>
        </label>
        <span className="font-mono text-[0.76rem] uppercase text-zinc-500" aria-live="polite">
          {rows.length} of {leads.length}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-zinc-400">
              {["Lead", "Pillars", "Latest trigger", "Signals", "Followers", "Status"].map((h, i) => (
                <th key={h} className={`px-4 py-3 ${i === 0 ? "pl-[30px]" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => {
              const first = firstSignal(l);
              const last = latestSignal(l);
              return (
                <tr
                  key={l.id}
                  tabIndex={0}
                  onClick={() => setOpenId(l.id)}
                  onKeyDown={(e) => e.key === "Enter" && setOpenId(l.id)}
                  className="cursor-pointer border-b border-zinc-800 align-top hover:bg-zinc-900"
                >
                  <td className="py-4 pr-4 pl-[30px]">
                    <p className="font-medium">
                      {l.name}
                      {l.isClient && <span className="ml-2"><Tag>Client</Tag></span>}
                    </p>
                    <p className="text-xs text-zinc-500">@{l.handle} · {l.location}</p>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {l.signals.map((s) => (
                        <Tag key={s.source + s.ref} marker={s === first}>
                          {PILLAR_BY_SOURCE[s.source].name}
                        </Tag>
                      ))}
                    </div>
                  </td>
                  <td className="max-w-[360px] px-4 py-4 text-[#cfcfcf]">
                    <p className="line-clamp-2">{last.detail}</p>
                    <p className="mt-1 text-xs text-zinc-500">{fmtDateTime(last.at)}</p>
                  </td>
                  <td className="px-4 py-4 tabular-nums">{l.signals.length}</td>
                  <td className="px-4 py-4 tabular-nums">{fmtCount(l.followers)}</td>
                  <td className="px-4 py-4">
                    <StatusPill status={l.status} label={STATUS_LABELS[l.status]} />
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-[30px] py-12 text-zinc-500">
                  No leads match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {open && <LeadDrawer key={open.id} lead={open} onClose={() => setOpenId(null)} />}
    </>
  );
}

function LeadDrawer({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const router = useRouter();
  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [notes, setNotes] = useState(lead.notes);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const dirty = status !== lead.status || notes !== lead.notes;

  // Status and notes belong to humans; signals stay read-only.
  const save = async () => {
    setSaving("saving");
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes }),
      });
      if (!res.ok) throw new Error();
      setSaving("saved");
      router.refresh();
    } catch {
      setSaving("error");
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 animate-fade-in" onClick={onClose}>
      <aside
        role="dialog"
        aria-label={`${lead.name} signal history`}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-[520px] animate-slide-in-right flex-col overflow-y-auto border-l border-zinc-800 bg-black"
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-[30px] py-6">
          <div>
            <Label>Lead</Label>
            <h2 className="mt-2 text-[1.8rem] leading-[1.05] tracking-[-0.03em]">{lead.name}</h2>
            <a
              href={`https://x.com/${lead.handle}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-zinc-400 hover:text-white hover:underline"
            >
              @{lead.handle}
            </a>
          </div>
          <button type="button" onClick={onClose} className="border border-zinc-700 px-3 py-2 font-mono text-[0.76rem] text-zinc-400 hover:text-white">
            Close
          </button>
        </div>

        <p className="px-[30px] py-5 text-[#cfcfcf]">{lead.bio}</p>
        <dl>
          {[
            ["Followers", fmtCount(lead.followers)],
            ["Location", lead.location || "Unknown"],
            ["First seen", fmtDateTime(firstSignal(lead).at)],
          ].map(([k, v]) => (
            <div key={k} className="grid grid-cols-[110px_1fr] border-t border-zinc-800 px-[30px] py-4">
              <dt className="text-zinc-400">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>

        <div className="space-y-4 border-t border-zinc-800 px-[30px] py-5">
          <label className="grid grid-cols-[110px_1fr] items-center">
            <span className="text-zinc-400">Status</span>
            <select
              value={status}
              onChange={(e) => {
                setSaving("idle");
                setStatus(e.target.value as LeadStatus);
              }}
              className="px-3 py-[10px] text-sm uppercase outline-none"
            >
              {(Object.keys(STATUS_LABELS) as LeadStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid grid-cols-[110px_1fr] items-start">
            <span className="pt-3 text-zinc-400">Notes</span>
            <textarea
              value={notes}
              onChange={(e) => {
                setSaving("idle");
                setNotes(e.target.value);
              }}
              rows={3}
              className="px-3 py-3 text-sm outline-none"
            />
          </label>
          <div className="flex items-center justify-end gap-3">
            <span className="font-mono text-[0.76rem] uppercase text-zinc-500" aria-live="polite">
              {saving === "saved" ? "Saved" : saving === "error" ? "Save failed" : ""}
            </span>
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saving === "saving"}
              className="bg-brand px-5 py-[10px] text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-40"
            >
              {saving === "saving" ? "Saving…" : "Save"}
            </button>
          </div>
        </div>

        <div className="border-t border-zinc-800 px-[30px] pt-6 pb-2">
          <Label>Signal history · append-only</Label>
        </div>
        <ol className="px-[30px] pb-10">
          {lead.signals.map((s, i) => (
            <li key={s.source + s.ref} className="border-t border-zinc-800 py-5 first:border-t-0">
              <div className="flex flex-wrap items-center gap-2">
                <Tag marker>{PILLAR_BY_SOURCE[s.source].name}</Tag>
                {i === 0 && <Tag>First signal</Tag>}
                {s.quality && <Tag>Substantive</Tag>}
              </div>
              <p className="mt-3 font-display text-[1.1rem] leading-snug whitespace-pre-wrap">{s.detail}</p>
              <p className="mt-2 font-mono text-[0.7rem] uppercase tracking-[0.06em] text-zinc-500">
                {fmtDateTime(s.at)} · {s.by} · {s.ref}
              </p>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
