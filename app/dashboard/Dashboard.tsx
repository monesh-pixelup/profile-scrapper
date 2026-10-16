"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
  LEAD_STATUSES,
  type Lead,
  type LeadPatch,
  type LeadSourceType,
  type LeadStatus,
} from "@/lib/leads/types";

type LoadState = "loading" | "ready" | "error";
type View = "all" | "target" | "toReach" | "reached";
type SortKey = "score" | "followers" | "newest" | "reachedAt";

const PAGE_SIZE = 25;

const VIEWS: { key: View; label: string }[] = [
  { key: "all", label: "All ICP leads" },
  { key: "target", label: "Target list" },
  { key: "toReach", label: "To reach out" },
  { key: "reached", label: "Reached out" },
];

// Statuses that imply a message has already been sent.
const CONTACTED_STATUSES: LeadStatus[] = ["contacted", "replied", "meeting", "won"];

const STATUS_STYLES: Record<LeadStatus, string> = {
  new: "border-zinc-700 bg-zinc-900 text-zinc-300",
  contacted: "border-zinc-700 bg-zinc-900 text-zinc-300",
  replied: "border-zinc-700 bg-zinc-900 text-zinc-300",
  meeting: "border-brand bg-brand text-white",
  won: "border-brand bg-brand text-white",
  not_interested: "border-zinc-800 bg-zinc-950 text-zinc-500",
};

function formatCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(count);
}

function formatDate(raw: string | null): string {
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function percent(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

// Keeps the checkbox and the status dropdown consistent: ticking "reached
// out" moves a New lead to Contacted, and picking a contacted-type status
// ticks the checkbox.
function withDerivedFields(lead: Lead, patch: LeadPatch): LeadPatch {
  const next: LeadPatch = { ...patch };
  if (patch.reached_out === true && lead.status === "new" && patch.status === undefined) {
    next.status = "contacted";
  }
  if (patch.reached_out === false && lead.status === "contacted" && patch.status === undefined) {
    next.status = "new";
  }
  if (patch.status && CONTACTED_STATUSES.includes(patch.status) && !lead.reached_out && patch.reached_out === undefined) {
    next.reached_out = true;
  }
  return next;
}

function applyPatchLocally(lead: Lead, patch: LeadPatch): Lead {
  const updated = { ...lead, ...patch };
  if (patch.reached_out !== undefined) {
    updated.reached_out_at = patch.reached_out ? (lead.reached_out_at ?? new Date().toISOString()) : null;
  }
  return updated;
}

export function Dashboard() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const [minScoreSetting, setMinScoreSetting] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [view, setView] = useState<View>("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<LeadSourceType | "all">("all");
  const [minScore, setMinScore] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Derived from `leads` (not stored as a copy) so the drawer always shows
  // the latest edits, and closes itself if the lead is deleted.
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const openLead = openLeadId ? leads.find((lead) => lead.id === openLeadId) : undefined;

  const load = useCallback(async () => {
    setLoadState("loading");
    setLoadError(null);
    try {
      const res = await fetch("/api/leads", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load leads");
      setConfigured(data.configured !== false);
      setMinScoreSetting(typeof data.minScore === "number" ? data.minScore : null);
      setLeads(data.leads ?? []);
      setLoadState("ready");
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load leads");
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    // Initial fetch on mount; load() only sets state after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Optimistic: update locally first, roll back to the previous rows if the
  // request fails.
  const patchLeads = async (ids: string[], patchFor: (lead: Lead) => LeadPatch) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const previous = leads;
    const patches = new Map<string, LeadPatch>();
    for (const lead of leads) {
      if (idSet.has(lead.id)) patches.set(lead.id, withDerivedFields(lead, patchFor(lead)));
    }
    setActionError(null);
    setLeads((rows) => rows.map((lead) => (patches.has(lead.id) ? applyPatchLocally(lead, patches.get(lead.id)!) : lead)));

    try {
      // Group identical patches so a bulk action is a single request.
      const groups = new Map<string, string[]>();
      for (const [id, patch] of patches) {
        const key = JSON.stringify(patch);
        groups.set(key, [...(groups.get(key) ?? []), id]);
      }
      const results = await Promise.all(
        [...groups].map(async ([key, groupIds]) => {
          const res = await fetch("/api/leads", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: groupIds, patch: JSON.parse(key) }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Failed to update");
          return (data.leads ?? []) as Lead[];
        })
      );
      const fresh = new Map(results.flat().map((lead) => [lead.id, lead]));
      setLeads((rows) => rows.map((lead) => fresh.get(lead.id) ?? lead));
    } catch (err) {
      setLeads(previous);
      setActionError(err instanceof Error ? err.message : "Failed to update");
    }
  };

  const removeLeads = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} lead${ids.length === 1 ? "" : "s"}? This can't be undone.`)) return;
    const previous = leads;
    const idSet = new Set(ids);
    setActionError(null);
    setLeads((rows) => rows.filter((lead) => !idSet.has(lead.id)));
    setSelected((prev) => new Set([...prev].filter((id) => !idSet.has(id))));
    try {
      const res = await fetch("/api/leads", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to delete");
    } catch (err) {
      setLeads(previous);
      setActionError(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const stats = useMemo(() => {
    const target = leads.filter((l) => l.in_target_list);
    const reached = leads.filter((l) => l.reached_out);
    const statusCounts = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0])) as Record<LeadStatus, number>;
    for (const lead of leads) statusCounts[lead.status] += 1;
    const replied = statusCounts.replied + statusCounts.meeting + statusCounts.won;
    return {
      total: leads.length,
      target: target.length,
      targetReached: target.filter((l) => l.reached_out).length,
      reached: reached.length,
      replied,
      meetings: statusCounts.meeting + statusCounts.won,
      statusCounts,
    };
  }, [leads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const minScoreNum = minScore.trim() === "" ? undefined : Number(minScore);

    const rows = leads.filter((lead) => {
      if (view === "target" && !lead.in_target_list) return false;
      if (view === "toReach" && (!lead.in_target_list || lead.reached_out)) return false;
      if (view === "reached" && !lead.reached_out) return false;
      if (statusFilter !== "all" && lead.status !== statusFilter) return false;
      if (sourceFilter !== "all" && lead.source_type !== sourceFilter) return false;
      if (minScoreNum !== undefined && !Number.isNaN(minScoreNum) && lead.icp_score < minScoreNum) return false;
      if (q) {
        const haystack = `${lead.handle} ${lead.name ?? ""} ${lead.description ?? ""} ${lead.notes ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    const time = (raw: string | null) => (raw ? new Date(raw).getTime() : 0);
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case "followers":
          return b.followers - a.followers;
        case "newest":
          return time(b.created_at) - time(a.created_at);
        case "reachedAt":
          return time(b.reached_out_at) - time(a.reached_out_at);
        default:
          return b.icp_score - a.icp_score;
      }
    });
  }, [leads, view, search, statusFilter, sourceFilter, minScore, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const selectedIds = [...selected].filter((id) => leads.some((l) => l.id === id));
  const allOnPageSelected = pageRows.length > 0 && pageRows.every((l) => selected.has(l.id));

  const resetPage = <T,>(setter: (v: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  const toggleSelectPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) pageRows.forEach((l) => next.delete(l.id));
      else pageRows.forEach((l) => next.add(l.id));
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sourceOptions = useMemo(
    () => [...new Set(leads.map((l) => l.source_type).filter((s): s is LeadSourceType => Boolean(s)))],
    [leads]
  );

  const viewCounts: Record<View, number> = {
    all: stats.total,
    target: stats.target,
    toReach: stats.target - stats.targetReached,
    reached: stats.reached,
  };

  return (
    <div className="flex-1 bg-zinc-950 text-zinc-100">
      <div className="mx-auto w-full max-w-7xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">ICP Dashboard</h1>
            <p className="mt-1 text-sm text-zinc-400">
              Profiles scoring {minScoreSetting ?? 50}+ are saved automatically whenever you scrape. Track who
              you&apos;ve reached out to below.
            </p>
          </div>
          <button
            onClick={load}
            disabled={loadState === "loading"}
            className="border border-zinc-800 bg-zinc-900 px-4 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white disabled:opacity-50"
          >
            {loadState === "loading" ? "Loading…" : "Refresh"}
          </button>
        </div>

        {!configured && <SetupNotice />}

        {loadState === "error" && (
          <div className="mb-6 border border-red-900 bg-red-950/50 p-4 text-sm text-red-300">
            {loadError}
          </div>
        )}

        {configured && (
          <>
            <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="ICP leads" value={stats.total} hint="Saved from all scrapes" />
              <StatTile
                label="Target list"
                value={stats.target}
                hint={`${percent(stats.target, stats.total)}% of ICP leads`}
              />
              <StatTile
                label="Reached out"
                value={stats.reached}
                hint={`${percent(stats.reached, stats.total)}% of ICP leads`}
              />
              <StatTile
                label="Replied"
                value={stats.replied}
                hint={`${percent(stats.replied, stats.reached)}% reply rate · ${stats.meetings} meetings`}
              />
            </div>

            <div className="mb-6 grid gap-3 lg:grid-cols-[2fr_3fr]">
              <div className="border border-zinc-800 bg-zinc-900/60 p-4">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-sm font-medium text-zinc-300">Target list progress</h2>
                  <span className="text-xs text-zinc-500">
                    {stats.targetReached} of {stats.target} reached out
                  </span>
                </div>
                <p className="mt-3 text-3xl font-semibold tabular-nums">
                  {percent(stats.targetReached, stats.target)}%
                </p>
                <div
                  className="mt-3 h-2 overflow-hidden bg-zinc-800"
                  role="progressbar"
                  aria-valuenow={percent(stats.targetReached, stats.target)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full bg-brand transition-all"
                    style={{ width: `${percent(stats.targetReached, stats.target)}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  {stats.target - stats.targetReached} target
                  {stats.target - stats.targetReached === 1 ? "" : "s"} still waiting for a first message.
                </p>
              </div>

              <div className="border border-zinc-800 bg-zinc-900/60 p-4">
                <h2 className="mb-3 text-sm font-medium text-zinc-300">Pipeline</h2>
                <ul className="flex flex-col gap-2">
                  {LEAD_STATUSES.map((status) => {
                    const count = stats.statusCounts[status];
                    return (
                      <li key={status}>
                        <button
                          onClick={() => {
                            setStatusFilter(statusFilter === status ? "all" : status);
                            setPage(1);
                          }}
                          className="group grid w-full grid-cols-[7.5rem_1fr_2.5rem] items-center gap-3 text-left text-xs"
                          title={`Filter by ${LEAD_STATUS_LABELS[status]}`}
                        >
                          <span
                            className={`truncate ${statusFilter === status ? "font-medium text-white" : "text-zinc-400 group-hover:text-zinc-200"}`}
                          >
                            {LEAD_STATUS_LABELS[status]}
                          </span>
                          <span className="h-1.5 overflow-hidden bg-zinc-800">
                            <span
                              className="block h-full bg-zinc-400 transition-all group-hover:bg-zinc-200"
                              style={{ width: `${percent(count, stats.total)}%` }}
                            />
                          </span>
                          <span className="text-right tabular-nums text-zinc-300">{count}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-1 border border-zinc-800 bg-zinc-900 p-1 sm:w-fit">
              {VIEWS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => {
                    setView(key);
                    setPage(1);
                  }}
                  className={`flex items-center gap-2 px-4 py-1.5 text-sm font-medium transition-colors ${
                    view === key ? "bg-brand text-white" : "text-zinc-400 hover:text-white"
                  }`}
                >
                  {label}
                  <span
                    className={`px-1.5 text-[0.65rem] tabular-nums ${
                      view === key ? "bg-zinc-300 text-zinc-800" : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {viewCounts[key]}
                  </span>
                </button>
              ))}
            </div>

            <div className="mb-3 flex flex-wrap items-end gap-3 border border-zinc-800 bg-zinc-900/60 p-3 text-sm">
              <Field label="Search">
                <input
                  value={search}
                  onChange={(e) => resetPage(setSearch)(e.target.value)}
                  placeholder="Name, handle, bio, notes…"
                  className="w-56 border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
                />
              </Field>
              <Field label="Status">
                <select
                  value={statusFilter}
                  onChange={(e) => resetPage(setStatusFilter)(e.target.value as LeadStatus | "all")}
                  className="border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-100 outline-none focus:border-zinc-500"
                >
                  <option value="all">All statuses</option>
                  {LEAD_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {LEAD_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Source">
                <select
                  value={sourceFilter}
                  onChange={(e) => resetPage(setSourceFilter)(e.target.value as LeadSourceType | "all")}
                  className="border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-100 outline-none focus:border-zinc-500"
                >
                  <option value="all">All sources</option>
                  {sourceOptions.map((s) => (
                    <option key={s} value={s}>
                      {LEAD_SOURCE_LABELS[s]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Min ICP score">
                <input
                  type="number"
                  value={minScore}
                  onChange={(e) => resetPage(setMinScore)(e.target.value)}
                  placeholder="0"
                  className="w-24 border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
                />
              </Field>
              <Field label="Sort by">
                <select
                  value={sortKey}
                  onChange={(e) => resetPage(setSortKey)(e.target.value as SortKey)}
                  className="border border-zinc-700 bg-zinc-950 px-2 py-1 text-zinc-100 outline-none focus:border-zinc-500"
                >
                  <option value="score">ICP score</option>
                  <option value="followers">Followers</option>
                  <option value="newest">Recently added</option>
                  <option value="reachedAt">Recently reached out</option>
                </select>
              </Field>
              <span className="ml-auto text-xs text-zinc-500">
                {filtered.length} of {leads.length} leads
              </span>
            </div>

            {selectedIds.length > 0 && (
              <div className="mb-3 flex flex-wrap items-center gap-2 border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs">
                <span className="mr-2 font-medium text-zinc-200">{selectedIds.length} selected</span>
                <BulkButton onClick={() => patchLeads(selectedIds, () => ({ reached_out: true }))}>
                  Mark reached out
                </BulkButton>
                <BulkButton onClick={() => patchLeads(selectedIds, () => ({ reached_out: false }))}>
                  Mark not reached
                </BulkButton>
                <BulkButton onClick={() => patchLeads(selectedIds, () => ({ in_target_list: true }))}>
                  Add to target list
                </BulkButton>
                <BulkButton onClick={() => patchLeads(selectedIds, () => ({ in_target_list: false }))}>
                  Remove from target list
                </BulkButton>
                <BulkButton danger onClick={() => removeLeads(selectedIds)}>
                  Delete
                </BulkButton>
                <button onClick={() => setSelected(new Set())} className="ml-auto text-zinc-500 hover:text-zinc-200">
                  Clear selection
                </button>
              </div>
            )}

            {actionError && (
              <div className="mb-3 border border-red-900 bg-red-950/50 px-3 py-2 text-xs text-red-300">
                {actionError}
              </div>
            )}

            <div className="w-full overflow-x-auto border border-zinc-800">
              <table className="w-full min-w-250 border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900 text-xs uppercase tracking-wide text-zinc-400">
                    <th className="w-10 px-3 py-2">
                      <input
                        type="checkbox"
                        checked={allOnPageSelected}
                        onChange={toggleSelectPage}
                        aria-label="Select all on page"
                        className="h-4 w-4 accent-zinc-200"
                      />
                    </th>
                    <th className="px-3 py-2 font-medium">Reached out</th>
                    <th className="px-3 py-2 font-medium">Profile</th>
                    <th className="px-3 py-2 font-medium">ICP score</th>
                    <th className="px-3 py-2 font-medium">Followers</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Target</th>
                    <th className="px-3 py-2 font-medium">Notes</th>
                    <th className="px-3 py-2 font-medium">Source</th>
                    <th className="px-3 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((lead) => (
                    <LeadRow
                      key={lead.id}
                      lead={lead}
                      selected={selected.has(lead.id)}
                      onToggleSelect={() => toggleSelect(lead.id)}
                      onPatch={(patch) => patchLeads([lead.id], () => patch)}
                      onDelete={() => removeLeads([lead.id])}
                      onOpen={() => setOpenLeadId(lead.id)}
                    />
                  ))}
                </tbody>
              </table>

              {loadState === "loading" && leads.length === 0 && (
                <p className="py-10 text-center text-sm text-zinc-500">Loading leads…</p>
              )}
              {loadState === "ready" && filtered.length === 0 && (
                <p className="py-10 text-center text-sm text-zinc-500">
                  {leads.length === 0
                    ? "No ICP leads yet. Run a scrape and qualifying profiles will show up here."
                    : "No leads match the current view and filters."}
                </p>
              )}
            </div>

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm text-zinc-400">
                <span>
                  Page {safePage} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <BulkButton onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage <= 1}>
                    Previous
                  </BulkButton>
                  <BulkButton
                    onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                    disabled={safePage >= totalPages}
                  >
                    Next
                  </BulkButton>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {openLead && (
        <LeadDrawer
          key={openLead.id}
          lead={openLead}
          onClose={() => setOpenLeadId(null)}
          onPatch={(patch) => patchLeads([openLead.id], () => patch)}
          onDelete={() => removeLeads([openLead.id])}
        />
      )}
    </div>
  );
}

function LeadRow({
  lead,
  selected,
  onToggleSelect,
  onPatch,
  onDelete,
  onOpen,
}: {
  lead: Lead;
  selected: boolean;
  onToggleSelect: () => void;
  onPatch: (patch: LeadPatch) => void;
  onDelete: () => void;
  onOpen: () => void;
}) {
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [syncedNotes, setSyncedNotes] = useState(lead.notes);

  // Pick up server-side note changes (e.g. after a refresh) without
  // clobbering an in-progress edit of a different value.
  if (lead.notes !== syncedNotes) {
    setSyncedNotes(lead.notes);
    setNotes(lead.notes ?? "");
  }

  const saveNotes = () => {
    const trimmed = notes.trim();
    if (trimmed === (lead.notes ?? "")) return;
    onPatch({ notes: trimmed || null });
  };

  return (
    <tr
      className={`border-b border-zinc-900 last:border-0 ${
        selected ? "bg-zinc-900" : lead.reached_out ? "bg-zinc-950/40" : "bg-zinc-950"
      } hover:bg-zinc-900`}
    >
      <td className="px-3 py-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Select @${lead.handle}`}
          className="h-4 w-4 accent-zinc-200"
        />
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={lead.reached_out}
            onChange={(e) => onPatch({ reached_out: e.target.checked })}
            className="h-4 w-4 accent-[#1F3BF0]"
          />
          <span className={`text-xs ${lead.reached_out ? "text-zinc-300" : "text-zinc-500"}`}>
            {lead.reached_out ? formatDate(lead.reached_out_at) : "Not yet"}
          </span>
        </label>
      </td>
      <td className="px-3 py-2">
        <button
          onClick={onOpen}
          title="View profile details"
          className="group flex w-full items-center gap-2 text-left"
        >
          {lead.profile_picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={lead.profile_picture} alt={lead.handle} className="h-8 w-8 shrink-0 object-cover" />
          ) : (
            <div className="h-8 w-8 shrink-0 bg-zinc-800" />
          )}
          <div className="min-w-0 max-w-64">
            <span
              className={`block truncate text-sm font-medium group-hover:underline ${
                lead.reached_out ? "text-zinc-400" : "text-zinc-100"
              }`}
            >
              {lead.name || lead.handle}
            </span>
            <span className="text-xs text-zinc-500">@{lead.handle}</span>
            {lead.description && <p className="line-clamp-1 text-xs text-zinc-500">{lead.description}</p>}
          </div>
        </button>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span
          title={lead.icp_signals.length > 0 ? lead.icp_signals.join(", ") : "No ICP signals matched"}
          className="bg-zinc-800 px-2 py-0.5 text-[0.65rem] font-medium text-zinc-300"
        >
          {lead.icp_tag} · {lead.icp_score}
        </span>
      </td>
      <td className="px-3 py-2 whitespace-nowrap tabular-nums text-zinc-300">{formatCount(lead.followers)}</td>
      <td className="px-3 py-2 whitespace-nowrap">
        <select
          value={lead.status}
          onChange={(e) => onPatch({ status: e.target.value as LeadStatus })}
          className={`border px-2 py-0.5 text-xs outline-none ${STATUS_STYLES[lead.status]}`}
        >
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s} className="bg-zinc-900 text-zinc-100">
              {LEAD_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2">
        <button
          onClick={() => onPatch({ in_target_list: !lead.in_target_list })}
          title={lead.in_target_list ? "Remove from target list" : "Add to target list"}
          aria-pressed={lead.in_target_list}
          className={`text-lg leading-none transition-colors ${
            lead.in_target_list ? "text-zinc-300 hover:text-zinc-300" : "text-zinc-700 hover:text-zinc-400"
          }`}
        >
          {lead.in_target_list ? "★" : "☆"}
        </button>
      </td>
      <td className="px-3 py-2">
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder="Add a note…"
          className="w-48 border border-transparent bg-transparent px-2 py-1 text-xs text-zinc-300 outline-none placeholder:text-zinc-600 hover:border-zinc-800 focus:border-zinc-600 focus:bg-zinc-950"
        />
      </td>
      <td className="px-3 py-2 whitespace-nowrap text-xs text-zinc-500">
        {lead.source_type ? LEAD_SOURCE_LABELS[lead.source_type] : "—"}
        {lead.source_ref && <span className="block text-zinc-600">{lead.source_ref}</span>}
      </td>
      <td className="px-3 py-2 text-right">
        <button
          onClick={onDelete}
          aria-label={`Delete @${lead.handle}`}
          title="Delete lead"
          className="p-1 text-zinc-600 hover:bg-zinc-800 hover:text-red-400"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </td>
    </tr>
  );
}

function formatDateTime(raw: string | null): string {
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// source_ref is either a profile handle or a numeric tweet id (see
// LeadSource in lib/leads/types.ts).
function sourceRefLink(ref: string): { label: string; href: string } {
  return /^\d+$/.test(ref)
    ? { label: `Tweet ${ref}`, href: `https://x.com/i/status/${ref}` }
    : { label: `@${ref}`, href: `https://x.com/${ref}` };
}

function describeSource(lead: Lead): string {
  const ref = lead.source_ref;
  switch (lead.source_type) {
    case "follower":
      return ref ? `Follows @${ref}` : "Found in a followers list";
    case "following":
      return ref ? `Followed by @${ref}` : "Found in a following list";
    case "tweet_reply":
      return "Replied to a tweet";
    case "top_icp":
      return ref ? `Commented on @${ref}'s tweets` : "Commented on scraped tweets";
    case "profile_scan":
      return "Found in a design-profile scan";
    case "daily_scrape":
      return ref ? `Commented on @${ref}'s tweets (daily scrape)` : "Found by the daily scrape";
    case "manual":
      return "Added manually";
    default:
      return "Unknown source";
  }
}

function LeadDrawer({
  lead,
  onClose,
  onPatch,
  onDelete,
}: {
  lead: Lead;
  onClose: () => void;
  onPatch: (patch: LeadPatch) => void;
  onDelete: () => void;
}) {
  const [notes, setNotes] = useState(lead.notes ?? "");
  const [syncedNotes, setSyncedNotes] = useState(lead.notes);
  const [copied, setCopied] = useState<string | null>(null);

  if (lead.notes !== syncedNotes) {
    setSyncedNotes(lead.notes);
    setNotes(lead.notes ?? "");
  }

  useEffect(() => {
    const handleKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const saveNotes = () => {
    const trimmed = notes.trim();
    if (trimmed === (lead.notes ?? "")) return;
    onPatch({ notes: trimmed || null });
  };

  const copy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied((current) => (current === key ? null : current)), 1500);
    } catch {
      // Clipboard can be unavailable (e.g. insecure context) — nothing to do.
    }
  };

  const profileUrl = `https://x.com/${lead.handle}`;
  const source = lead.source_ref ? sourceRefLink(lead.source_ref) : null;
  const scorePct = Math.max(0, Math.min(100, lead.icp_score));

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`@${lead.handle} details`}>
      <div className="absolute inset-0 animate-fade-in bg-black/60" onClick={onClose} />

      <aside className="relative flex h-full w-full max-w-md animate-slide-in-right flex-col border-l border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Lead details</span>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {/* Identity */}
          <section className="flex items-start gap-4">
            {lead.profile_picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={lead.profile_picture.replace("_normal.", "_400x400.")}
                alt={lead.handle}
                className="h-16 w-16 shrink-0 object-cover ring-1 ring-zinc-800"
              />
            ) : (
              <div className="h-16 w-16 shrink-0 bg-zinc-800" />
            )}
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold">{lead.name || lead.handle}</h2>
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <span className="truncate">@{lead.handle}</span>
                <button
                  onClick={() => copy("handle", `@${lead.handle}`)}
                  className="text-xs text-zinc-500 hover:text-zinc-200"
                >
                  {copied === "handle" ? "Copied" : "Copy"}
                </button>
              </div>
              <a
                href={profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 border border-zinc-700 px-3 py-1 text-xs font-medium text-zinc-200 hover:border-zinc-500 hover:text-white"
              >
                Open on X ↗
              </a>
            </div>
          </section>

          {/* Stats */}
          <section className="grid grid-cols-3 gap-2">
            <DrawerStat label="Followers" value={formatCount(lead.followers)} title={lead.followers.toLocaleString()} />
            <DrawerStat label="Following" value={formatCount(lead.following)} title={lead.following.toLocaleString()} />
            <DrawerStat label="ICP score" value={String(lead.icp_score)} />
          </section>

          {/* Bio */}
          <DrawerSection title="Bio">
            {lead.description ? (
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-zinc-200">{lead.description}</p>
            ) : (
              <p className="text-sm text-zinc-500">No bio.</p>
            )}
            <p className="mt-3 text-xs text-zinc-500">
              <span className="text-zinc-400">Location:</span> {lead.location || "Not provided"}
            </p>
          </DrawerSection>

          {/* ICP fit */}
          <DrawerSection title="ICP fit">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">{lead.icp_tag ?? "—"}</span>
              <span className="text-xs tabular-nums text-zinc-400">{lead.icp_score} / 100</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden bg-zinc-800">
              <div className="h-full bg-zinc-300" style={{ width: `${scorePct}%` }} />
            </div>
            <p className="mt-3 mb-1.5 text-xs text-zinc-500">Matched signals</p>
            {lead.icp_signals.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {lead.icp_signals.map((signal) => (
                  <span key={signal} className="border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-300">
                    {signal}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-zinc-500">No ICP signals matched.</p>
            )}
          </DrawerSection>

          {/* Source */}
          <DrawerSection title="Where this lead came from">
            <p className="text-sm text-zinc-200">{describeSource(lead)}</p>
            <dl className="mt-2 grid grid-cols-[7rem_1fr] gap-y-1.5 text-xs">
              <dt className="text-zinc-500">Source type</dt>
              <dd className="text-zinc-300">{lead.source_type ? LEAD_SOURCE_LABELS[lead.source_type] : "—"}</dd>
              <dt className="text-zinc-500">Scraped from</dt>
              <dd className="min-w-0 truncate">
                {source ? (
                  <a href={source.href} target="_blank" rel="noopener noreferrer" className="text-zinc-300 hover:underline">
                    {source.label} ↗
                  </a>
                ) : (
                  <span className="text-zinc-300">—</span>
                )}
              </dd>
            </dl>
          </DrawerSection>

          {/* Outreach */}
          <DrawerSection title="Outreach">
            <div className="space-y-3">
              <label className="flex cursor-pointer items-center justify-between gap-3">
                <span className="text-sm text-zinc-300">Reached out</span>
                <span className="flex items-center gap-2">
                  <span className={`text-xs ${lead.reached_out ? "text-zinc-300" : "text-zinc-500"}`}>
                    {lead.reached_out ? formatDateTime(lead.reached_out_at) : "Not yet"}
                  </span>
                  <input
                    type="checkbox"
                    checked={lead.reached_out}
                    onChange={(e) => onPatch({ reached_out: e.target.checked })}
                    className="h-4 w-4 accent-[#1F3BF0]"
                  />
                </span>
              </label>

              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-zinc-300">Status</span>
                <select
                  value={lead.status}
                  onChange={(e) => onPatch({ status: e.target.value as LeadStatus })}
                  className={`border px-2 py-0.5 text-xs outline-none ${STATUS_STYLES[lead.status]}`}
                >
                  {LEAD_STATUSES.map((s) => (
                    <option key={s} value={s} className="bg-zinc-900 text-zinc-100">
                      {LEAD_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-zinc-300">Target list</span>
                <button
                  onClick={() => onPatch({ in_target_list: !lead.in_target_list })}
                  aria-pressed={lead.in_target_list}
                  className={`border px-3 py-0.5 text-xs font-medium transition-colors ${
                    lead.in_target_list
                      ? "border-brand bg-brand text-white hover:bg-brand-hover"
                      : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500 hover:text-white"
                  }`}
                >
                  {lead.in_target_list ? "★ In target list" : "☆ Add to target list"}
                </button>
              </div>

              <div>
                <span className="mb-1.5 block text-sm text-zinc-300">Notes</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={saveNotes}
                  rows={4}
                  placeholder="Context, conversation history, next steps…"
                  className="w-full resize-y border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 outline-none placeholder:text-zinc-600 focus:border-zinc-600"
                />
                <p className="mt-1 text-[0.7rem] text-zinc-600">Saves when you click outside the box.</p>
              </div>
            </div>
          </DrawerSection>

          {/* Timeline */}
          <DrawerSection title="Timeline">
            <dl className="grid grid-cols-[9rem_1fr] gap-y-1.5 text-xs">
              <dt className="text-zinc-500">First saved</dt>
              <dd className="text-zinc-300">{formatDateTime(lead.created_at)}</dd>
              <dt className="text-zinc-500">Last seen in a scrape</dt>
              <dd className="text-zinc-300">{formatDateTime(lead.last_seen_at)}</dd>
              <dt className="text-zinc-500">Reached out</dt>
              <dd className="text-zinc-300">{formatDateTime(lead.reached_out_at)}</dd>
              <dt className="text-zinc-500">Last updated</dt>
              <dd className="text-zinc-300">{formatDateTime(lead.updated_at)}</dd>
            </dl>
          </DrawerSection>

          {/* Record */}
          <DrawerSection title="Record">
            <dl className="grid grid-cols-[9rem_1fr] gap-y-1.5 text-xs">
              <dt className="text-zinc-500">Lead ID</dt>
              <dd className="flex min-w-0 items-center gap-2">
                <span className="truncate font-mono text-zinc-400">{lead.id}</span>
                <button onClick={() => copy("id", lead.id)} className="shrink-0 text-zinc-500 hover:text-zinc-200">
                  {copied === "id" ? "Copied" : "Copy"}
                </button>
              </dd>
              <dt className="text-zinc-500">Username key</dt>
              <dd className="truncate font-mono text-zinc-400">{lead.username}</dd>
            </dl>
          </DrawerSection>
        </div>

        <div className="flex items-center justify-between border-t border-zinc-800 px-5 py-3">
          <button
            onClick={onDelete}
            className="border border-red-900 bg-red-950/60 px-3 py-1 text-xs font-medium text-red-300 hover:border-red-700"
          >
            Delete lead
          </button>
          <button
            onClick={onClose}
            className="border border-zinc-700 bg-zinc-900 px-4 py-1 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:text-white"
          >
            Close
          </button>
        </div>
      </aside>
    </div>
  );
}

function DrawerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-zinc-800 bg-zinc-900/40 p-4">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-500">{title}</h3>
      {children}
    </section>
  );
}

function DrawerStat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="border border-zinc-800 bg-zinc-900/40 px-3 py-2" title={title}>
      <p className="text-[0.65rem] font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function StatTile({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="border border-zinc-800 bg-zinc-900/60 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums text-zinc-100">{value.toLocaleString()}</p>
      <p className="mt-1 text-xs text-zinc-500">{hint}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

function BulkButton({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-40 ${
        danger
          ? "border-red-900 bg-red-950/60 text-red-300 hover:border-red-700"
          : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function SetupNotice() {
  return (
    <div className="mb-6 border border-zinc-700 bg-zinc-900 p-5 text-sm text-zinc-300">
      <h2 className="font-semibold">Connect Supabase to start saving ICP leads</h2>
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-zinc-300">
        <li>
          Create a Supabase project and run <code className="bg-zinc-900 px-1">supabase/schema.sql</code> in
          its SQL editor.
        </li>
        <li>
          Add <code className="bg-zinc-900 px-1">SUPABASE_URL</code> and{" "}
          <code className="bg-zinc-900 px-1">SUPABASE_SERVICE_ROLE_KEY</code> to{" "}
          <code className="bg-zinc-900 px-1">.env.local</code> (optionally{" "}
          <code className="bg-zinc-900 px-1">ICP_MIN_SCORE</code>, default 50).
        </li>
        <li>Restart the dev server. Every scrape will then save qualifying ICP profiles here.</li>
      </ol>
    </div>
  );
}
