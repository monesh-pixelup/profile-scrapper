"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PILLARS } from "@/lib/outreach/model";

interface NavItem {
  href: string;
  label: string;
  marker?: string;
}

const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Overview" },
      { href: "/leads", label: "Leads" },
    ],
  },
  {
    label: "Signal pillars",
    items: [
      { href: "/signals", label: "All pillars" },
      ...PILLARS.map((p) => ({
        href: `/signals/${p.slug}`,
        label: p.name,
        marker: String(p.n).padStart(2, "0"),
      })),
    ],
  },
  {
    label: "Manage",
    items: [
      { href: "/sources", label: "Sources" },
      { href: "/runs", label: "Run log" },
      { href: "/settings", label: "Settings" },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/scraper", label: "Profile scraper" },
      { href: "/dashboard", label: "ICP dashboard" },
    ],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/signals") return pathname === "/signals";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const all = GROUPS.flatMap((g) => g.items);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-zinc-800 bg-black">
        <div className="flex items-center justify-between px-[30px] py-5">
          <Link href="/" className="font-display text-lg font-medium tracking-tight text-white">
            Pixelup Labs
          </Link>
          <span className="font-mono text-[0.76rem] uppercase tracking-[0.07em] text-zinc-400">
            X outreach sourcing
          </span>
        </div>
        {/* Small screens: the sidebar collapses into a scrolling strip. */}
        <nav className="flex gap-6 overflow-x-auto border-t border-zinc-800 px-[30px] py-3 lg:hidden">
          {all.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              aria-current={isActive(pathname, i.href) ? "page" : undefined}
              className={`text-[0.85rem] font-medium whitespace-nowrap uppercase ${
                isActive(pathname, i.href) ? "text-white" : "text-zinc-400"
              }`}
            >
              {i.label}
            </Link>
          ))}
        </nav>
      </header>

      <div className="flex flex-1 lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden border-r border-zinc-800 lg:block">
          <nav className="sticky top-[65px] flex max-h-[calc(100vh-65px)] flex-col overflow-y-auto py-6">
            {GROUPS.map((g) => (
              <div key={g.label} className="mb-6 last:mb-0">
                <p className="px-[30px] pb-2 font-mono text-[0.7rem] uppercase tracking-[0.08em] text-zinc-600">
                  {g.label}
                </p>
                {g.items.map((i) => {
                  const active = isActive(pathname, i.href);
                  return (
                    <Link
                      key={i.href}
                      href={i.href}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 border-l-[3px] py-2 pr-4 pl-[27px] text-[0.85rem] font-medium uppercase ${
                        active
                          ? "border-brand bg-zinc-900 text-white"
                          : "border-transparent text-zinc-400 hover:text-white"
                      }`}
                    >
                      {i.marker && (
                        <span className="w-5 font-mono text-[0.7rem] font-normal text-zinc-600">{i.marker}</span>
                      )}
                      <span className="truncate">{i.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </>
  );
}
