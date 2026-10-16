"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Section, Tag } from "@/components/ui";
import type { ConfigRow } from "@/lib/outreach/model";

const GROUPS = ["Collection", "Listening", "Filters"] as const;

export function SettingsView({ config }: { config: ConfigRow[] }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(config.map((c) => [c.key, c.value])),
  );
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const changed = config.filter((c) => values[c.key] !== c.value);
  const dirty = changed.length > 0;

  const save = async () => {
    setState("saving");
    try {
      const res = await fetch("/api/outreach/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: Object.fromEntries(changed.map((c) => [c.key, values[c.key]])) }),
      });
      if (!res.ok) throw new Error();
      setState("saved");
      router.refresh();
    } catch {
      setState("error");
    }
  };

  return (
    <>
      {GROUPS.map((g) => (
        <Section key={g} label={g}>
          <div>
            {config.filter((c) => c.group === g).map((c) => (
              <label key={c.key} className="grid items-center gap-x-6 gap-y-2 border-t border-zinc-800 py-4 last:border-b sm:grid-cols-[1fr_200px]">
                <span>
                  <span className="font-mono text-[0.8rem]">{c.key}</span>
                  <span className="block text-sm text-zinc-500">{c.hint}</span>
                </span>
                <input
                  value={values[c.key]}
                  onChange={(e) => {
                    setState("idle");
                    setValues({ ...values, [c.key]: e.target.value });
                  }}
                  placeholder="not set"
                  className="px-4 py-[14px] font-mono text-sm outline-none"
                />
              </label>
            ))}
          </div>
        </Section>
      ))}

      <Section label="ICP gate">
        <div className="mb-3 flex items-center gap-3">
          <Tag marker>Pass-through</Tag>
        </div>
        <p className="max-w-[68ch] text-[#cfcfcf]">
          The gate sits between ingestion and Leads and currently lets everyone through. Role, stage and
          qualifying signals will be configured here once the ICP is defined. Until then, the filters above are
          noise filters only.
        </p>
      </Section>

      <div className="sticky bottom-0 flex items-center justify-end gap-4 border-t border-zinc-800 bg-black px-[30px] py-4">
        <span className="font-mono text-[0.76rem] uppercase text-zinc-500" aria-live="polite">
          {state === "saved" ? "Saved" : state === "error" ? "Save failed" : dirty ? "Unsaved changes" : "Up to date"}
        </span>
        <button
          type="button"
          disabled={!dirty || state === "saving"}
          onClick={save}
          className="bg-brand px-6 py-[14px] text-sm font-medium text-white hover:bg-brand-hover disabled:opacity-40"
        >
          Save config
        </button>
      </div>
    </>
  );
}
