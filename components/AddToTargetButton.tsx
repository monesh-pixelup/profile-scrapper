"use client";

import { useState } from "react";
import type { LeadSource } from "@/lib/leads/types";
import type { TwitterUser } from "@/lib/twitter/types";

type State = "idle" | "saving" | "saved" | "error";

// Adds a scraped profile to the target list in Supabase, regardless of its
// ICP score (auto-save only keeps profiles above ICP_MIN_SCORE).
export function AddToTargetButton({ user, source }: { user: TwitterUser; source?: LeadSource }) {
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (state === "saving" || state === "saved") return;
    setState("saving");
    setError(null);

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, inTargetList: true, source }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setState("saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setState("error");
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={state === "saving" || state === "saved"}
      title={error ?? (state === "saved" ? "In your target list" : "Add to target list")}
      className={`rounded-full border px-2.5 py-1 text-[0.7rem] font-medium whitespace-nowrap transition-colors disabled:cursor-default ${
        state === "saved"
          ? "border-emerald-800 bg-emerald-950 text-emerald-300"
          : state === "error"
            ? "border-red-900 bg-red-950 text-red-300 hover:border-red-700"
            : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500 hover:text-white"
      }`}
    >
      {state === "saving" ? "Saving…" : state === "saved" ? "✓ Targeted" : state === "error" ? "Retry" : "+ Target"}
    </button>
  );
}
