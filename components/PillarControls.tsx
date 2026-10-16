"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { btnPrimary, btnSmall, IconPlay } from "@/components/ui";
import { pillarPausedKey, type Pillar } from "@/lib/outreach/model";

// Triggering a run from the UI is not wired yet: Apify actors and the
// extension push to /api/outreach/ingest on their own schedule.
export function RunButton({ pillar, variant = "small" }: { pillar: Pillar; variant?: "small" | "primary" }) {
  const manual = pillar.runner === "extension";
  return (
    <button
      type="button"
      disabled
      title={
        manual
          ? "Run this from the Chrome extension; it posts to /api/outreach/ingest"
          : "Triggered by the Apify schedule; it posts to /api/outreach/ingest"
      }
      className={variant === "primary" ? btnPrimary : btnSmall}
    >
      {manual ? "Run in extension" : "Scheduled"}
      {variant === "primary" && <IconPlay />}
    </button>
  );
}

export function PauseToggle({ pillar, paused }: { pillar: Pillar; paused: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const toggle = async () => {
    setBusy(true);
    try {
      await fetch("/api/outreach/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: { [pillarPausedKey(pillar.source)]: String(!paused) } }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" onClick={toggle} disabled={busy} aria-pressed={!paused} className={btnSmall}>
      {paused ? "Resume" : "Pause"}
    </button>
  );
}
