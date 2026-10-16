"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { btnSmall, Label, Tag } from "@/components/ui";
import { fmtDateTime, SOURCE_TYPE_LABELS, type Source, type SourceRowType, type SourceType } from "@/lib/outreach/model";

const TYPES = Object.keys(SOURCE_TYPE_LABELS) as SourceRowType[];
const ADDABLE = TYPES.filter((t): t is SourceType => t !== "client");

export function SourcesView({ sources, disabled }: { sources: Source[]; disabled: boolean }) {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [type, setType] = useState<SourceType>("vc");
  const [error, setError] = useState<string | null>(null);

  const call = async (method: "POST" | "PATCH", body: object) => {
    setError(null);
    const res = await fetch("/api/outreach/sources", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Request failed");
      return false;
    }
    router.refresh();
    return true;
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handle.trim()) return;
    if (await call("POST", { handle, type })) setHandle("");
  };

  return (
    <>
      <form onSubmit={add} className="flex flex-wrap items-end gap-3 border-b border-zinc-800 px-[30px] py-6">
        <label className="flex flex-col gap-2">
          <Label>Handle</Label>
          <input
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="@account"
            className="w-64 px-4 py-[14px] text-sm outline-none"
          />
        </label>
        <label className="flex flex-col gap-2">
          <Label>Type</Label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as SourceType)}
            className="px-3 py-[14px] text-sm uppercase outline-none"
          >
            {ADDABLE.map((t) => (
              <option key={t} value={t}>
                {SOURCE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={disabled}
          className="bg-brand px-6 py-[14px] text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-40"
        >
          Add source
        </button>
        {error && <span className="text-sm text-red-400">{error}</span>}
      </form>

      {TYPES.map((t) => {
        const list = sources.filter((r) => r.type === t);
        if (list.length === 0) return null;
        return (
          <section key={t} className="border-b border-zinc-800 px-[30px] py-7">
            <Label>{SOURCE_TYPE_LABELS[t]}</Label>
            <ul className="mt-4">
              {list.map((r) => (
                <li
                  key={r.handle}
                  className="grid items-center gap-x-6 gap-y-2 border-t border-zinc-800 py-4 last:border-b sm:grid-cols-[1fr_auto_auto_auto]"
                >
                  <a
                    href={`https://x.com/${r.handle}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-display text-[1.25rem] tracking-[-0.02em] hover:underline"
                  >
                    @{r.handle}
                  </a>
                  {r.type === "client" ? (
                    <span />
                  ) : (
                    <Tag marker={r.active}>{r.active ? "Active" : "Paused"}</Tag>
                  )}
                  <span className="font-mono text-[0.76rem] uppercase text-zinc-400">
                    {r.type === "client"
                      ? ""
                      : `Last run: ${fmtDateTime(r.lastRunAt)}${r.anchors > 0 ? ` · ${r.anchors} anchors` : ""}`}
                  </span>
                  {r.type === "client" ? (
                    <span />
                  ) : (
                    <button
                      type="button"
                      className={btnSmall}
                      onClick={() => call("PATCH", { handle: r.handle, active: !r.active })}
                    >
                      {r.active ? "Pause" : "Resume"}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {sources.length === 0 && <p className="px-[30px] py-12 text-zinc-500">No sources yet. Add one above.</p>}
    </>
  );
}
