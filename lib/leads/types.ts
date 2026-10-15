// Shared between the API routes and the dashboard (client-safe: no server
// imports here).

export const LEAD_STATUSES = ["new", "contacted", "replied", "meeting", "won", "not_interested"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  replied: "Replied",
  meeting: "Meeting booked",
  won: "Won",
  not_interested: "Not interested",
};

export type LeadSourceType =
  | "follower"
  | "following"
  | "tweet_reply"
  | "top_icp"
  | "profile_scan"
  | "daily_scrape"
  | "manual";

export const LEAD_SOURCE_LABELS: Record<LeadSourceType, string> = {
  follower: "Follower",
  following: "Following",
  tweet_reply: "Tweet reply",
  top_icp: "Top ICP",
  profile_scan: "Profile scan",
  daily_scrape: "Daily scrape",
  manual: "Manual",
};

export interface LeadSource {
  type: LeadSourceType;
  // Profile handle or tweet id the scrape ran against.
  ref?: string;
}

// Row shape of public.icp_leads (see supabase/schema.sql).
export interface Lead {
  id: string;
  username: string;
  handle: string;
  name: string | null;
  description: string | null;
  profile_picture: string | null;
  location: string | null;
  followers: number;
  following: number;
  icp_score: number;
  icp_tag: string | null;
  icp_signals: string[];
  source_type: LeadSourceType | null;
  source_ref: string | null;
  in_target_list: boolean;
  reached_out: boolean;
  reached_out_at: string | null;
  status: LeadStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
  last_seen_at: string;
}

// Fields the dashboard is allowed to change. Everything else is owned by
// the scraper.
export type LeadPatch = Partial<Pick<Lead, "in_target_list" | "reached_out" | "status" | "notes">>;
