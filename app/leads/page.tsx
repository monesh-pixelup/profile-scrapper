import { Suspense } from "react";
import { connection } from "next/server";
import { SetupNotice } from "@/components/SetupNotice";
import { PageHeader } from "@/components/ui";
import { loadOutreach } from "@/lib/outreach/load";
import { LeadsView } from "./LeadsView";

async function LeadsPageContent() {
  await connection();
  const data = await loadOutreach();
  return (
    <>
      <PageHeader
        label="Leads"
        title="Everyone we have surfaced"
        sub="One row per person. The signal that first surfaced them never changes. Later signals stack, and more signals means a stronger lead."
      />
      {!data.ready && (
        <div className="px-[30px] pt-6">
          <SetupNotice data={data} />
        </div>
      )}
      <LeadsView leads={data.leads} />
    </>
  );
}


export default function LeadsPage() {
  return (
    <Suspense fallback={<div className="p-[30px] text-sm text-zinc-500">Loading…</div>}>
      <LeadsPageContent />
    </Suspense>
  );
}
