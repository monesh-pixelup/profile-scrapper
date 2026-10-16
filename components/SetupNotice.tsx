import type { OutreachData } from "@/lib/outreach/load";

// Shown when the outreach tables cannot be read. Renders nothing when fine.
export function SetupNotice({ data }: { data: OutreachData }) {
  if (data.ready) return null;
  return (
    <div className="mb-6 border border-zinc-700 bg-zinc-900 p-5 text-sm text-zinc-300">
      <p className="font-medium text-white">
        {data.problem === "not_configured" ? "Supabase is not configured" : "Could not read the outreach tables"}
      </p>
      <p className="mt-2 text-zinc-400">{data.message}</p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-zinc-400">
        <li>
          Set <code className="font-mono">SUPABASE_URL</code> and <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> in{" "}
          <code className="font-mono">.env.local</code>.
        </li>
        <li>
          Run <code className="font-mono">supabase/migrations/003_outreach_signals.sql</code> in the SQL editor.
        </li>
        <li>
          Set <code className="font-mono">INGEST_SECRET</code>, then send data to{" "}
          <code className="font-mono">POST /api/outreach/ingest</code>. See docs/outreach-sourcing.md.
        </li>
      </ol>
    </div>
  );
}
