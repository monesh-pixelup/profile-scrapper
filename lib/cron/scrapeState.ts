import { getSupabase } from "@/lib/supabase/server";

// Row shapes of the tables in supabase/migrations/002_daily_scrape_state.sql.
export interface ProfileState {
  username: string;
  last_run_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  runs: number;
  icp_leads_saved: number;
  est_spend_usd: number;
}

export interface ScrapedTweet {
  tweet_id: string;
  author_username: string;
  reply_count_at_scrape: number;
  newest_reply_id: string | null;
  times_scraped: number;
  first_scraped_at: string;
  last_scraped_at: string;
}

function db() {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase is not configured");
  return supabase;
}

export async function getProfileState(username: string): Promise<ProfileState | null> {
  const { data, error } = await db()
    .from("daily_scrape_profiles")
    .select("*")
    .eq("username", username.toLowerCase())
    .maybeSingle();
  if (error) throw new Error(`Failed to read scrape state: ${error.message}`);
  return data as ProfileState | null;
}

export async function saveProfileState(state: ProfileState): Promise<void> {
  const { error } = await db().from("daily_scrape_profiles").upsert(state, { onConflict: "username" });
  if (error) throw new Error(`Failed to save scrape state: ${error.message}`);
}

export async function getScrapedTweets(tweetIds: string[]): Promise<Map<string, ScrapedTweet>> {
  const map = new Map<string, ScrapedTweet>();
  if (tweetIds.length === 0) return map;
  // Bounded by DAILY_TWEETS_PER_PROFILE (100), so one `in` query is fine.
  const { data, error } = await db().from("scraped_tweets").select("*").in("tweet_id", tweetIds);
  if (error) throw new Error(`Failed to read scraped tweets: ${error.message}`);
  for (const row of (data ?? []) as ScrapedTweet[]) map.set(row.tweet_id, row);
  return map;
}

export async function saveScrapedTweets(rows: ScrapedTweet[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await db().from("scraped_tweets").upsert(rows, { onConflict: "tweet_id" });
  if (error) throw new Error(`Failed to save scraped tweets: ${error.message}`);
}

// Tweet ids are 64-bit integers as strings — compare as BigInt, never as
// numbers (precision loss) or strings (length-dependent ordering).
export function maxTweetId(ids: (string | null | undefined)[]): string | null {
  let max: bigint | null = null;
  for (const id of ids) {
    if (!id || !/^\d+$/.test(id)) continue;
    const value = BigInt(id);
    if (max === null || value > max) max = value;
  }
  return max === null ? null : max.toString();
}
