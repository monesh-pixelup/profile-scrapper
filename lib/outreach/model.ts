// Client-safe types, labels, static pillar metadata and formatting helpers
// for the outreach sourcing UI. No server imports here.

export const SIGNAL_SOURCES = [
  "new_follower",
  "post_like",
  "competitor_follower",
  "vc_comment",
  "designer_comment",
] as const;
export type SignalSource = (typeof SIGNAL_SOURCES)[number];

export type Runner = "apify" | "extension";
export type LeadStatus = "new" | "contacted" | "replied" | "meeting" | "won" | "not_interested";

export const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  replied: "Replied",
  meeting: "Meeting booked",
  won: "Won",
  not_interested: "Not interested",
};

export type PillarStatus = "active" | "paused" | "attention";

// Static description of each pillar. Live state (last run, status, counts)
// is derived from the database; see lib/outreach/derive.ts.
export interface Pillar {
  n: number;
  slug: string;
  source: SignalSource;
  name: string;
  short: string;
  description: string;
  runner: Runner;
  cadence: string;
  sourcesTab: SourceType | null;
  steps: string[];
  configKeys: string[];
}

export const PILLARS: Pillar[] = [
  {
    n: 1,
    slug: "new-followers",
    source: "new_follower",
    name: "New followers",
    short: "Fresh followers of our accounts",
    description:
      "Scrolls the newest followers of @dakshpixelup and @pixeluplabs and stops as soon as it meets a follower it has already seen.",
    runner: "extension",
    cadence: "Manual, about daily",
    sourcesTab: "own",
    steps: [
      "Open the followers list while logged in. Newest first.",
      "Scroll with random delays until any of the last 4 to 5 anchors appears.",
      "If the run cap is hit first, log anchor_not_found and send what was collected.",
      "A re-follow after an unfollow is not a new signal. The dedupe key covers it.",
    ],
    configKeys: ["follower_run_cap"],
  },
  {
    n: 2,
    slug: "post-likers",
    source: "post_like",
    name: "Post likers",
    short: "People who liked our posts",
    description:
      "Scrapes the likers list of our own posts. X only shows this to the author, so it cannot run on other people's posts.",
    runner: "extension",
    cadence: "Manual, per post",
    sourcesTab: "own",
    steps: [
      "Give the extension post URLs, or let it pick posts above a like threshold.",
      "It opens /status/<id>/likes and scrapes the list.",
      "Each post is tracked. It is re-scraped only if likes grew past the regrowth threshold.",
    ],
    configKeys: ["like_regrowth_pct"],
  },
  {
    n: 3,
    slug: "competitor-followers",
    source: "competitor_follower",
    name: "Competitor followers",
    short: "Followers of competitor accounts",
    description:
      "Pulls followers of competitor accounts. The first run backfills the newest N, then weekly runs only take the delta.",
    runner: "apify",
    cadence: "Weekly",
    sourcesTab: "competitor",
    steps: [
      "First run: backfill the most recent followers up to the backfill cap.",
      "Later runs: stop at the anchor, same as new followers.",
      "Apply the cheap bot pre-filters before anything reaches Leads.",
    ],
    configKeys: ["competitor_backfill_cap", "commenter_min_followers", "require_bio_and_avatar"],
  },
  {
    n: 4,
    slug: "vc-comments",
    source: "vc_comment",
    name: "VC and founder comments",
    short: "Commenters under big accounts",
    description:
      "Listens under posts from VCs, YC and large founders. Likes are hidden, so the comment itself is the signal and the best opener.",
    runner: "apify",
    cadence: "Daily",
    sourcesTab: "vc",
    steps: [
      "For each source account, take posts inside the window with enough replies.",
      "Scrape replies up to the cap, once, plus one revisit after 24 hours.",
      "Drop short and bot-looking commenters. Flag long or question comments as substantive.",
      "Store the comment text on the signal.",
    ],
    configKeys: [
      "listen_post_window_hours",
      "listen_min_replies",
      "listen_max_posts_per_account",
      "listen_max_replies_per_post",
      "commenter_min_words",
    ],
  },
  {
    n: 5,
    slug: "designer-comments",
    source: "designer_comment",
    name: "Designer comments",
    short: "Commenters under big designers",
    description:
      "Same listening method as VC comments, pointed at large designer accounts where our buyers and peers hang out.",
    runner: "apify",
    cadence: "Daily",
    sourcesTab: "designer",
    steps: [
      "Read the designer accounts from the Sources tab.",
      "Apply the same window, reply and cap rules as the VC pillar.",
      "Store each comment with its quality flag.",
    ],
    configKeys: [
      "listen_post_window_hours",
      "listen_min_replies",
      "listen_max_replies_per_post",
      "commenter_min_words",
    ],
  },
];

export const PILLAR_BY_SOURCE = Object.fromEntries(PILLARS.map((p) => [p.source, p])) as Record<
  SignalSource,
  Pillar
>;

export interface Signal {
  source: SignalSource;
  ref: string;
  detail: string;
  at: string;
  by: Runner;
  quality?: "substantive";
}

export interface Lead {
  id: string;
  handle: string;
  name: string;
  bio: string;
  followers: number;
  location: string;
  status: LeadStatus;
  notes: string;
  isClient: boolean;
  // Oldest first. The first entry is the signal that surfaced the lead.
  signals: Signal[];
}

export type SourceType = "own" | "competitor" | "vc" | "designer";
export type SourceRowType = SourceType | "client";

export interface Source {
  handle: string;
  type: SourceRowType;
  active: boolean;
  lastRunAt: string | null;
  anchors: number;
}

export const SOURCE_TYPE_LABELS: Record<SourceRowType, string> = {
  own: "Own",
  competitor: "Competitor",
  vc: "VC / founder",
  designer: "Designer",
  client: "Previous client",
};

export interface Run {
  id: string;
  source: SignalSource;
  runner: Runner;
  startedAt: string;
  received: number;
  newLeads: number;
  newSignals: number;
  errors: number;
  flags: string[];
  cost: number | null;
}

export type ConfigGroup = "Collection" | "Listening" | "Filters";

export interface ConfigRow {
  key: string;
  value: string;
  group: ConfigGroup;
  hint: string;
}

// ---- helpers ----

export const pillarPausedKey = (source: SignalSource) => `pillar_paused_${source}`;

export function latestSignal(l: Lead): Signal {
  return l.signals[l.signals.length - 1];
}

export function firstSignal(l: Lead): Signal {
  return l.signals[0];
}

export function leadsForSource(leads: Lead[], source: SignalSource): Lead[] {
  return leads.filter((l) => l.signals.some((s) => s.source === source));
}

export function pillarStats(leads: Lead[], source: SignalSource) {
  const signals = leads.flatMap((l) => l.signals).filter((s) => s.source === source);
  return { leads: leadsForSource(leads, source).length, signals: signals.length };
}

// Fixed locale + zone so server and client render the same text.
export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function fmtDateTime(iso: string | null): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

export function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}
