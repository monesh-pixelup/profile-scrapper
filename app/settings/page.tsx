import { Suspense } from "react";
import { connection } from "next/server";
import { SetupNotice } from "@/components/SetupNotice";
import { PageHeader } from "@/components/ui";
import { loadOutreach } from "@/lib/outreach/load";
import { SettingsView } from "./SettingsView";

async function SettingsPageContent() {
  await connection();
  const data = await loadOutreach();
  return (
    <>
      <PageHeader
        label="Settings"
        title="Thresholds and the ICP gate"
        sub="Every threshold lives here, so tuning never needs a code change. Changes apply on the next run."
      />
      {!data.ready && (
        <div className="px-[30px] pt-6">
          <SetupNotice data={data} />
        </div>
      )}
      <SettingsView config={data.config} />
    </>
  );
}


export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-[30px] text-sm text-zinc-500">Loading…</div>}>
      <SettingsPageContent />
    </Suspense>
  );
}
