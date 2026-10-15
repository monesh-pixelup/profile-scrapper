// Profiles the daily cron job (app/api/cron/daily-icp) scrapes for ICP
// leads. Accepts bare handles, "@handles" or profile URLs.
//
// You can also add profiles without a redeploy via the DAILY_SCRAPE_PROFILES
// env var (comma-separated) in Vercel — both lists are merged and deduped.
export const DAILY_SCRAPE_PROFILES: string[] = [
  // "someprofile",
  // "@anotherprofile",
  // "https://x.com/thirdprofile",
];

// Hard cap on tweets fetched per profile per run. Only original posts are
// fetched (no retweets, no replies to others).
export const DAILY_TWEETS_PER_PROFILE = 100;

// Tweets with fewer comments than this are skipped entirely (filtered by
// the scraper, so they're never billed). Every commenter scrape is billed
// for at least ~15 results, so tiny threads aren't worth it.
export const DAILY_MIN_REPLIES = 5;

// After the first run, each run re-checks tweets posted in this window —
// long enough to catch comments that keep arriving for a day or two after
// a tweet is posted. Extended automatically if runs were missed.
export const DAILY_LOOKBACK_HOURS = 48;

// An already-scraped tweet is only re-scraped (for its *new* replies only)
// when its comment count has grown by at least this many AND this share.
export const DAILY_RESCRAPE_MIN_NEW_REPLIES = 10;
export const DAILY_RESCRAPE_MIN_GROWTH = 0.25;

// Max Apify spend on scraping commenters, per profile per run. Highest-value
// tweets (most new comments) go first until this runs out.
export const DAILY_REPLIERS_BUDGET_USD_PER_PROFILE = 0.25;

// How many profiles are scraped at the same time.
export const DAILY_SCRAPE_CONCURRENCY = 4;
