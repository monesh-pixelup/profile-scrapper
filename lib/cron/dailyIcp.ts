import {
  TWEET_SCRAPER_MIN_BILLED_ITEMS,
  TWEET_SCRAPER_RATE_USD_PER_ITEM,
  fetchProfilePosts,
  fetchTweetRepliers,
} from "@/lib/apify/client";
import { saveIcpLeads } from "@/lib/leads/store";
import { parseTwitterUrl } from "@/lib/twitter/parseUrl";
import type { TwitterTweet, TwitterUser } from "@/lib/twitter/types";
import {
  getProfileState,
  getScrapedTweets,
  maxTweetId,
  saveProfileState,
  saveScrapedTweets,
  type ScrapedTweet,
} from "./scrapeState";
import {
  DAILY_LOOKBACK_HOURS,
  DAILY_MIN_REPLIES,
  DAILY_REPLIERS_BUDGET_USD_PER_PROFILE,
  DAILY_RESCRAPE_MIN_GROWTH,
  DAILY_RESCRAPE_MIN_NEW_REPLIES,
  DAILY_SCRAPE_CONCURRENCY,
  DAILY_SCRAPE_PROFILES,
  DAILY_TWEETS_PER_PROFILE,
} from "@/config/daily-scrape";

// Replier scrapes return at most 100 results; cap each call's spend to
// that (with headroom) so one thread can't eat the whole profile budget.
const REPLIERS_CALL_CAP_USD = 100 * TWEET_SCRAPER_RATE_USD_PER_ITEM * 1.2;

export interface ProfileRunResult {
  username: string;
  ok: boolean;
  error?: string;
  firstRun: boolean;
  tweetsFetched: number;
  newTweetsScraped: number;
  tweetsToppedUp: number;
  tweetsUnchanged: number;
  tweetsSkippedForBudget: number;
  commentersFound: number;
  icpLeadsSaved: number;
  estSpendUsd: number;
  // True when the run stopped early to stay inside the function time limit.
  cutShort: boolean;
}

export interface DailyRunResult {
  startedAt: string;
  durationMs: number;
  profiles: ProfileRunResult[];
  totalIcpLeadsSaved: number;
  totalEstSpendUsd: number;
}

// Normalizes handles/@handles/URLs and dedupes case-insensitively. Invalid
// entries are dropped (and logged) rather than failing the whole run.
export function resolveProfiles(inputs: string[]): string[] {
  const seen = new Set<string>();
  const usernames: string[] = [];
  for (const raw of inputs) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const target = parseTwitterUrl(trimmed);
    if (target?.type !== "profile") {
      console.warn(`[daily-icp] skipping invalid profile entry: ${trimmed}`);
      continue;
    }
    const key = target.username.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    usernames.push(target.username);
  }
  return usernames;
}

// Config file list + DAILY_SCRAPE_PROFILES env var (comma/newline separated).
export function getConfiguredProfiles(): string[] {
  const fromEnv = (process.env.DAILY_SCRAPE_PROFILES ?? "").split(/[,\n]/);
  return resolveProfiles([...DAILY_SCRAPE_PROFILES, ...fromEnv]);
}

function billedUsd(resultCount: number): number {
  return Math.max(TWEET_SCRAPER_MIN_BILLED_ITEMS, resultCount) * TWEET_SCRAPER_RATE_USD_PER_ITEM;
}

interface Candidate {
  tweet: TwitterTweet;
  previous?: ScrapedTweet;
  // How many comments we expect to pay for — used to prioritize.
  expectedNew: number;
}

// Decides which fetched tweets are worth scraping:
//   - never scraped before → scrape all its commenters
//   - scraped before and comments grew enough → scrape only replies after
//     the newest one already seen (since_id)
//   - otherwise → skip, nothing new worth paying for
function pickCandidates(tweets: TwitterTweet[], known: Map<string, ScrapedTweet>) {
  const candidates: Candidate[] = [];
  let unchanged = 0;

  for (const tweet of tweets) {
    const previous = known.get(tweet.id);
    if (!previous) {
      candidates.push({ tweet, expectedNew: tweet.replyCount });
      continue;
    }
    const growth = tweet.replyCount - previous.reply_count_at_scrape;
    if (
      growth >= DAILY_RESCRAPE_MIN_NEW_REPLIES &&
      growth >= previous.reply_count_at_scrape * DAILY_RESCRAPE_MIN_GROWTH
    ) {
      candidates.push({ tweet, previous, expectedNew: growth });
    } else {
      unchanged += 1;
    }
  }

  candidates.sort((a, b) => b.expectedNew - a.expectedNew);
  return { candidates, unchanged };
}

async function runProfile(username: string, deadline: number): Promise<ProfileRunResult> {
  const key = username.toLowerCase();
  const startedAt = new Date();
  const result: ProfileRunResult = {
    username,
    ok: false,
    firstRun: true,
    tweetsFetched: 0,
    newTweetsScraped: 0,
    tweetsToppedUp: 0,
    tweetsUnchanged: 0,
    tweetsSkippedForBudget: 0,
    commentersFound: 0,
    icpLeadsSaved: 0,
    estSpendUsd: 0,
    cutShort: false,
  };

  let state: Awaited<ReturnType<typeof getProfileState>> = null;
  const scrapedRows: ScrapedTweet[] = [];
  const tweetErrors: string[] = [];

  try {
    if (Date.now() >= deadline) {
      result.cutShort = true;
      throw new Error("Skipped: ran out of time before this profile started");
    }

    state = await getProfileState(key);
    result.firstRun = !state?.last_success_at;

    // First run: latest posts, no time limit (still capped at 100). Later
    // runs: only posts since the last successful run, widened to the
    // lookback window so tweets still gathering comments get re-checked.
    const lookbackStart = Date.now() - DAILY_LOOKBACK_HOURS * 3600_000;
    const sinceMs = state?.last_success_at
      ? Math.min(Date.parse(state.last_success_at), lookbackStart)
      : undefined;

    const tweets = await fetchProfilePosts(username, {
      maxItems: DAILY_TWEETS_PER_PROFILE,
      minReplies: DAILY_MIN_REPLIES,
      sinceTime: sinceMs !== undefined ? Math.floor(sinceMs / 1000) : undefined,
    });
    result.tweetsFetched = tweets.length;
    result.estSpendUsd += billedUsd(tweets.length);

    const known = await getScrapedTweets(tweets.map((t) => t.id));
    const { candidates, unchanged } = pickCandidates(tweets, known);
    result.tweetsUnchanged = unchanged;

    const seenUsers = new Set<string>();
    const users: TwitterUser[] = [];
    let repliersSpend = 0;

    for (let i = 0; i < candidates.length; i++) {
      const remaining = DAILY_REPLIERS_BUDGET_USD_PER_PROFILE - repliersSpend;
      if (remaining < billedUsd(0)) {
        result.tweetsSkippedForBudget = candidates.length - i;
        break;
      }
      if (Date.now() >= deadline) {
        result.cutShort = true;
        result.tweetsSkippedForBudget = candidates.length - i;
        break;
      }

      const { tweet, previous } = candidates[i];
      const sinceId = previous?.newest_reply_id ?? undefined;
      try {
        const replies = await fetchTweetRepliers(tweet.id, Math.min(REPLIERS_CALL_CAP_USD, remaining), sinceId);
        const cost = billedUsd(replies.rawCount);
        repliersSpend += cost;
        result.estSpendUsd += cost;
        if (previous) result.tweetsToppedUp += 1;
        else result.newTweetsScraped += 1;

        for (const reply of replies.repliers) {
          if (!reply.user) continue;
          const userKey = reply.user.userName.toLowerCase();
          if (seenUsers.has(userKey)) continue;
          seenUsers.add(userKey);
          users.push(reply.user);
        }

        const now = new Date().toISOString();
        scrapedRows.push({
          tweet_id: tweet.id,
          author_username: key,
          reply_count_at_scrape: tweet.replyCount,
          newest_reply_id: maxTweetId([previous?.newest_reply_id, ...replies.repliers.map((r) => r.replyId)]),
          times_scraped: (previous?.times_scraped ?? 0) + 1,
          first_scraped_at: previous?.first_scraped_at ?? now,
          last_scraped_at: now,
        });
      } catch (error) {
        // One bad thread shouldn't sink the rest of the profile.
        tweetErrors.push(`${tweet.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    result.commentersFound = users.length;
    result.icpLeadsSaved = await saveIcpLeads(users, { type: "daily_scrape", ref: username });
    result.ok = true;
    if (tweetErrors.length > 0) result.error = `Some threads failed: ${tweetErrors.join("; ")}`;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }

  // Persist progress even on partial failure, so tweets already paid for
  // aren't paid for again tomorrow.
  try {
    await saveScrapedTweets(scrapedRows);
    const fullySucceeded = result.ok && tweetErrors.length === 0 && !result.cutShort;
    await saveProfileState({
      username: key,
      last_run_at: startedAt.toISOString(),
      // Only advance on a clean run, so a failed/cut-short day is retried
      // by widening the next run's window instead of being skipped.
      last_success_at: fullySucceeded ? startedAt.toISOString() : (state?.last_success_at ?? null),
      last_error: result.error ?? null,
      runs: (state?.runs ?? 0) + 1,
      icp_leads_saved: (state?.icp_leads_saved ?? 0) + result.icpLeadsSaved,
      est_spend_usd: Number(state?.est_spend_usd ?? 0) + result.estSpendUsd,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.error = result.error ? `${result.error}; ${message}` : message;
  }

  result.estSpendUsd = Math.round(result.estSpendUsd * 10000) / 10000;
  console.log(`[daily-icp] @${username}`, JSON.stringify(result));
  return result;
}

// Profiles run `DAILY_SCRAPE_CONCURRENCY` at a time; one failing profile
// never stops the others.
export async function runDailyIcpScrape(usernames: string[], deadline: number): Promise<DailyRunResult> {
  const startedAt = new Date();
  const results: ProfileRunResult[] = new Array(usernames.length);
  let next = 0;

  const worker = async () => {
    while (next < usernames.length) {
      const index = next++;
      results[index] = await runProfile(usernames[index], deadline);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(DAILY_SCRAPE_CONCURRENCY, usernames.length) }, worker)
  );

  return {
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    profiles: results,
    totalIcpLeadsSaved: results.reduce((sum, r) => sum + r.icpLeadsSaved, 0),
    totalEstSpendUsd: Math.round(results.reduce((sum, r) => sum + r.estSpendUsd, 0) * 10000) / 10000,
  };
}
