import type { SignalSource } from "./model";

// One record from a sender (Apify actor or the Chrome extension).
export interface IngestRecord {
  handle: string;
  x_user_id?: string;
  name?: string;
  bio?: string;
  followers?: number;
  following?: number;
  location?: string;
  profile_picture?: string;
  // Post URL or the account that was scraped.
  source_ref: string;
  // Comment text or similar raw trigger.
  detail?: string;
  captured_at?: string;
  comment_quality?: "substantive";
}

type Config = Record<string, string>;

const COMMENT_SOURCES: SignalSource[] = ["vc_comment", "designer_comment"];
const FILTERED_SOURCES: SignalSource[] = ["competitor_follower", "vc_comment", "designer_comment"];

const num = (config: Config, key: string, fallback: number) => {
  const n = Number(config[key]);
  return config[key] !== undefined && config[key] !== "" && Number.isFinite(n) ? n : fallback;
};

function wordCount(text: string | undefined): number {
  return text ? text.trim().split(/\s+/).filter(Boolean).length : 0;
}

// Cheap noise filters (section 7 of the spec). Thresholds come from the
// config table, so changing a value changes the next run with no deploy.
export function filterNoise(source: SignalSource, records: IngestRecord[], config: Config): IngestRecord[] {
  if (!FILTERED_SOURCES.includes(source)) return records;

  const minFollowers = num(config, "commenter_min_followers", 0);
  const minWords = num(config, "commenter_min_words", 0);
  const needsBio = config.require_bio_and_avatar === "true";

  return records.filter((r) => {
    if ((r.followers ?? 0) < minFollowers) return false;
    if (needsBio && (!r.bio?.trim() || !r.profile_picture)) return false;
    if (COMMENT_SOURCES.includes(source) && wordCount(r.detail) < minWords) return false;
    return true;
  });
}

// Pluggable ICP gate between ingestion and Leads. The ICP definition is not
// final, so this passes everything through. Plug the real rule in here and
// read its settings from the config table; do not hardcode ICP logic elsewhere.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function icpGate(_source: SignalSource, records: IngestRecord[], _config: Config): IngestRecord[] {
  return records;
}

// Comment sources: long comments and questions are worth a human's attention.
export function commentQuality(source: SignalSource, record: IngestRecord): "substantive" | undefined {
  if (record.comment_quality) return record.comment_quality;
  if (!COMMENT_SOURCES.includes(source)) return undefined;
  return wordCount(record.detail) >= 20 || record.detail?.includes("?") ? "substantive" : undefined;
}
