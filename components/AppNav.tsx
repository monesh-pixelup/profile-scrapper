"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Scraper" },
  { href: "/dashboard", label: "ICP Dashboard" },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
      <nav className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
        <span className="text-sm font-semibold tracking-tight text-zinc-100">Profile Scrapper</span>
        <div className="flex gap-1">
          {LINKS.map(({ href, label }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  active ? "bg-zinc-100 text-zinc-900" : "text-zinc-400 hover:text-white"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
