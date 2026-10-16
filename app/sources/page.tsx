import { Suspense } from "react";
import { connection } from "next/server";
import { SetupNotice } from "@/components/SetupNotice";
import { PageHeader } from "@/components/ui";
import { loadOutreach } from "@/lib/outreach/load";
import { SourcesView } from "./SourcesView";

async function SourcesPageContent() {
  await connection();
  const data = await loadOutreach();
  return (
    <>
      <PageHeader
        label="Sources"
        title="Accounts we monitor"
        sub="Followers, competitor and listening pillars all read from this list. To monitor a new account, add a row. Previous clients are listed for reference."
      />
      {!data.ready && (
        <div className="px-[30px] pt-6">
          <SetupNotice data={data} />
        </div>
      )}
      <SourcesView sources={data.sources} disabled={!data.ready} />
    </>
  );
}


export default function SourcesPage() {
  return (
    <Suspense fallback={<div className="p-[30px] text-sm text-zinc-500">Loading…</div>}>
      <SourcesPageContent />
    </Suspense>
  );
}
