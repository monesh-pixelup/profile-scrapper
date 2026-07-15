import type { TwitterTweet, TwitterUser } from "@/lib/twitter/types";
import type { RawApifyFollowerRow, RawApifyTweet } from "./types";

const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN;
const TWEET_SCRAPER_ACTOR_ID =
  process.env.APIFY_TWEET_SCRAPER_ACTOR_ID ??
  "kaitoeasyapi~twitter-x-data-tweet-scraper-pay-per-result-cheapest";
const FOLLOWER_SCRAPER_ACTOR_ID =
  process.env.APIFY_FOLLOWER_SCRAPER_ACTOR_ID ?? "xquik~x-follower-scraper";

// Result caps, tuned to keep this "pay per result" actor's cost reasonable
// while still covering enough of the audience to surface matches.
//
// Cost note: the follower-scraper actor's advertised $0.1/1k rate only
// applies on paid Apify subscription tiers. On the default Free tier it
// bills $0.01/item (100x higher) — confirmed against real run usage, where
// a 200-item run (100 followers + 100 following) cost exactly $2.00. The
// tweet-scraper actor has no such tier markup ($0.00025/tweet on every
// tier), so its caps stay comparatively generous.
const FOLLOWERS_MAX_ITEMS_PER_TARGET = 10;
const QUOTERS_MAX_ITEMS = 50;
const REPLIERS_MAX_ITEMS = 100;
// Latest-tweets is unfiltered/unsorted beyond the actor's own "Latest"
// ordering: pull up to 1000 tweets, matching the actor's $0.25/1k rate.
const LATEST_TWEETS_MAX_ITEMS = 1000;

// Hard per-run spend caps (Apify enforces these itself via the
// `maxTotalChargeUsd` run parameter) as a safety net against runaway cost if
// an actor ever ignores our maxItems input or a pricing tier changes again.
const FOLLOWERS_MAX_CHARGE_USD = 0.3;
const QUOTERS_MAX_CHARGE_USD = 0.05;
const REPLIERS_MAX_CHARGE_USD = 0.1;
// 1000 tweets @ $0.00025/tweet = $0.25 expected; capped with headroom.
const LATEST_TWEETS_MAX_CHARGE_USD = 0.3;

function getApiToken(): string {
  if (!APIFY_API_TOKEN) {
    throw new Error(
      "APIFY_API_TOKEN is not set. Add it to your .env.local to enable fetching profiles."
    );
  }
  return APIFY_API_TOKEN;
}

// Runs an actor and blocks until it finishes, returning its dataset items
// directly — one HTTP call per actor invocation, no separate run/poll/fetch
// round trips. `maxTotalChargeUsd` is a hard spend cap enforced by Apify
// itself: the run is stopped once it would exceed that amount, regardless
// of the actor's own maxItems input.
async function runActorSync<T>(
  actorId: string,
  input: Record<string, unknown>,
  maxTotalChargeUsd: number
): Promise<T[]> {
  const token = getApiToken();
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?maxTotalChargeUsd=${maxTotalChargeUsd}`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    throw new Error(`Apify actor run failed (${res.status}): ${await res.text()}`);
  }

  return res.json() as Promise<T[]>;
}

function toTwitterUserFromFollowerRow(raw: RawApifyFollowerRow): TwitterUser | null {
  if (!raw.username || raw.resultType === "diagnostic") return null;
  return {
    userName: raw.username,
    name: raw.name ?? "",
    description: raw.description ?? "",
    profilePicture: raw.profilePicture ?? "",
    followers: raw.followers ?? 0,
    following: raw.following ?? 0,
  };
}

function toTwitterUserFromTweetAuthor(raw: RawApifyTweet): TwitterUser | null {
  // The actor occasionally returns malformed stub tweets with an empty
  // `author: {}` (no fields at all); skip those rather than surfacing a
  // profile with an undefined username.
  if (!raw.author?.userName) return null;
  return {
    userName: raw.author.userName,
    name: raw.author.name,
    description: raw.author.description ?? "",
    profilePicture: raw.author.profilePicture,
    followers: raw.author.followers,
    following: raw.author.following,
  };
}

// Fetches both followers and following for the account in a single actor
// run — the follower-scraper actor supports multiple relations per run, so
// this replaces what would otherwise be two separate API calls.
export async function fetchProfileConnections(username: string): Promise<TwitterUser[]> {
  const rows = await runActorSync<RawApifyFollowerRow>(
    FOLLOWER_SCRAPER_ACTOR_ID,
    {
      twitterHandles: [username],
      relations: ["followers", "following"],
      maxItemsPerTarget: FOLLOWERS_MAX_ITEMS_PER_TARGET,
      outputMode: "compact",
    },
    FOLLOWERS_MAX_CHARGE_USD
  );

  return rows.map(toTwitterUserFromFollowerRow).filter((user): user is TwitterUser => user !== null);
}

// Accounts that quote-tweeted the given tweet.
export async function fetchTweetQuoters(tweetId: string): Promise<TwitterUser[]> {
  const tweets = await runActorSync<RawApifyTweet>(
    TWEET_SCRAPER_ACTOR_ID,
    {
      quoted_tweet_id: tweetId,
      maxItems: QUOTERS_MAX_ITEMS,
      queryType: "Latest",
    },
    QUOTERS_MAX_CHARGE_USD
  );

  return tweets.map(toTwitterUserFromTweetAuthor).filter((user): user is TwitterUser => user !== null);
}

// Accounts that replied within the tweet's conversation thread.
// Note: there is no way to fetch a tweet's retweeters via this actor (it's
// a search-based scraper, and X's search product doesn't expose that data
// the way it exposes quotes/replies), so retweeters are not included here.
export async function fetchTweetRepliers(tweetId: string): Promise<TwitterUser[]> {
  const tweets = await runActorSync<RawApifyTweet>(
    TWEET_SCRAPER_ACTOR_ID,
    {
      conversation_id: tweetId,
      "filter:replies": true,
      maxItems: REPLIERS_MAX_ITEMS,
      queryType: "Latest",
    },
    REPLIERS_MAX_CHARGE_USD
  );

  return tweets.map(toTwitterUserFromTweetAuthor).filter((user): user is TwitterUser => user !== null);
}

function toTwitterTweet(raw: RawApifyTweet): TwitterTweet | null {
  // The actor occasionally returns malformed stub tweets with no text and
  // no url (only an id and a view count); skip those rather than showing
  // blank cards in the UI.
  if (!raw.text && !raw.url) return null;
  return {
    id: raw.id,
    url: raw.url,
    text: raw.text,
    createdAt: raw.createdAt,
    retweetCount: raw.retweetCount ?? 0,
    replyCount: raw.replyCount ?? 0,
    likeCount: raw.likeCount ?? 0,
    quoteCount: raw.quoteCount ?? 0,
    viewCount: raw.viewCount ?? 0,
  };
}

// Latest tweets posted by the account, newest first — no type filter (posts,
// replies, quotes, and retweets are all included) and no result cap beyond
// maxItems itself; every tweet the actor returns is shown.
export async function fetchLatestTweets(
  username: string,
  maxItems: number = LATEST_TWEETS_MAX_ITEMS
): Promise<TwitterTweet[]> {
  const tweets = await runActorSync<RawApifyTweet>(
    TWEET_SCRAPER_ACTOR_ID,
    {
      from: username,
      maxItems,
      queryType: "Latest",
      "include:nativeretweets": true,
    },
    LATEST_TWEETS_MAX_CHARGE_USD
  );

  return tweets.map(toTwitterTweet).filter((tweet): tweet is TwitterTweet => tweet !== null);
}
