import type { ReactNode } from "react";
import type { LeadStatus, Runner } from "@/lib/outreach/model";

export const btnPrimary =
  "flex w-full items-center justify-between bg-brand px-[18px] py-[18px] text-[0.9rem] font-medium uppercase text-white hover:bg-brand-hover disabled:opacity-40";
export const btnSecondary =
  "flex w-full items-center justify-between bg-zinc-900 px-[18px] py-[18px] text-[0.9rem] font-medium uppercase text-white hover:bg-[#1b1b1b] disabled:opacity-40";
export const btnSmall =
  "border border-zinc-700 bg-transparent px-3 py-[9px] font-mono text-[0.76rem] font-normal uppercase text-zinc-400 hover:border-zinc-500 hover:text-white disabled:opacity-40";
export const chip =
  "border border-dashed border-zinc-700 px-[18px] py-[9px] text-[0.85rem] font-medium uppercase text-zinc-400 hover:text-white aria-pressed:border-solid aria-pressed:border-brand aria-pressed:bg-brand aria-pressed:text-white";

const icon = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  "aria-hidden": true,
} as const;

export function IconArrowUpRight() {
  return (
    <svg {...icon}>
      <path d="M7 17 17 7M8 7h9v9" />
    </svg>
  );
}
export function IconChevronRight() {
  return (
    <svg {...icon}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
export function IconRefresh() {
  return (
    <svg {...icon}>
      <path d="M20 11a8 8 0 0 0-14-4M4 4v4h4M4 13a8 8 0 0 0 14 4M20 20v-4h-4" />
    </svg>
  );
}
export function IconPlay() {
  return (
    <svg {...icon}>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return (
    <span className="font-mono text-[0.76rem] font-normal uppercase tracking-[0.07em] text-zinc-400">
      {children}
    </span>
  );
}

export function PageHeader({
  label,
  title,
  sub,
  actions,
}: {
  label: string;
  title: string;
  sub?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-6 border-b border-zinc-800 px-[30px] py-8">
      <div>
        <Label>{label}</Label>
        <h1 className="mt-3 text-[clamp(2rem,3.4vw,2.6rem)] leading-[1.05] tracking-[-0.035em]">{title}</h1>
        {sub && <p className="mt-3 max-w-[68ch] text-[#cfcfcf]">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// Section with a 220px label column, per the design system.
export function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="grid gap-x-10 gap-y-4 border-t border-zinc-800 px-[30px] py-7 first:border-t-0 md:grid-cols-[220px_1fr]">
      <div>
        <Label>{label}</Label>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

export function Tag({ children, marker = false }: { children: ReactNode; marker?: boolean }) {
  return (
    <span className="relative inline-block bg-zinc-900 px-2 py-1 pb-[7px] font-mono text-[0.68rem] font-normal uppercase tracking-[0.06em] whitespace-nowrap text-zinc-300">
      {children}
      {marker && <span className="absolute bottom-0 left-0 h-1 w-1.5 bg-brand" />}
    </span>
  );
}

export function RunnerTag({ runner }: { runner: Runner }) {
  return <Tag marker={runner === "apify"}>{runner === "apify" ? "Apify" : "Extension"}</Tag>;
}

const STATUS_STYLE: Record<LeadStatus, string> = {
  new: "border-zinc-700 text-zinc-300",
  contacted: "border-zinc-700 text-zinc-300",
  replied: "border-zinc-500 text-white",
  meeting: "border-brand bg-brand text-white",
  won: "border-brand bg-brand text-white",
  not_interested: "border-zinc-800 text-zinc-600",
};

export function StatusPill({ status, label }: { status: LeadStatus; label: string }) {
  return (
    <span
      className={`inline-block border px-2 py-0.5 font-mono text-[0.68rem] uppercase tracking-[0.06em] whitespace-nowrap ${STATUS_STYLE[status]}`}
    >
      {label}
    </span>
  );
}

export function StatGrid({ items }: { items: { label: string; value: string; hint?: string }[] }) {
  return (
    <div className="grid grid-cols-2 gap-px border-b border-zinc-800 bg-zinc-800 lg:grid-cols-4">
      {items.map((s) => (
        <div key={s.label} className="bg-black px-[30px] py-6">
          <Label>{s.label}</Label>
          <p className="mt-3 font-display text-4xl leading-none tracking-[-0.03em] tabular-nums">{s.value}</p>
          {s.hint && <p className="mt-2 text-sm text-zinc-500">{s.hint}</p>}
        </div>
      ))}
    </div>
  );
}

export function Card({
  title,
  action,
  children,
  className = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`border border-zinc-800 bg-zinc-900/40 ${className}`}>
      {title && (
        <header className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <h2 className="font-sans text-[0.95rem] font-medium tracking-normal">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Sparkline({ data, className = "" }: { data: number[]; className?: string }) {
  const max = Math.max(...data, 1);
  const w = 100;
  const h = 28;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * (h - 3) - 1.5}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={`h-7 w-full ${className}`} aria-hidden>
      <polyline points={pts} fill="none" stroke="var(--blue-hover)" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
