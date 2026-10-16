import type { PillarStatus as Status } from "@/lib/outreach/model";

const MAP = {
  active: { text: "Active", dot: "bg-brand" },
  paused: { text: "Paused", dot: "bg-zinc-600" },
  attention: { text: "Needs attention", dot: "bg-red-500" },
} as const;

export function PillarStatus({ status }: { status: Status }) {
  const m = MAP[status];
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[0.76rem] uppercase tracking-[0.06em] text-zinc-300">
      <span className={`h-1.5 w-1.5 ${m.dot}`} />
      {m.text}
    </span>
  );
}
