"use client";

import { useState, type ReactNode } from "react";

export function Tabs({ tabs }: { tabs: { id: string; label: string; count?: number; content: ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0].id);
  return (
    <div>
      <div role="tablist" className="flex gap-6 overflow-x-auto border-b border-zinc-800">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={active === t.id}
            onClick={() => setActive(t.id)}
            className={`-mb-px border-b-2 pb-3 text-[0.85rem] whitespace-nowrap ${
              active === t.id ? "border-brand text-white" : "border-transparent text-zinc-400 hover:text-white"
            }`}
          >
            {t.label}
            {t.count !== undefined && <span className="ml-2 font-mono text-[0.7rem] text-zinc-500">{t.count}</span>}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" hidden={active !== t.id} className="pt-6">
          {t.content}
        </div>
      ))}
    </div>
  );
}
