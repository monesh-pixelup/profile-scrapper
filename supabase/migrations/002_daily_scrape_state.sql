-- State for the daily ICP cron, so each run only pays for what's new.
-- Run this once in the Supabase SQL editor (safe to re-run).

-- One row per profile on the daily list.
create table if not exists public.daily_scrape_profiles (
  username         text primary key,           -- lowercased handle
  last_run_at      timestamptz,                -- last attempt (any outcome)
  last_success_at  timestamptz,                -- start time of last fully successful run
  last_error       text,
  -- Running totals, handy for spotting profiles that never yield ICPs.
  runs             integer not null default 0,
  icp_leads_saved  integer not null default 0,
  est_spend_usd    numeric(10, 4) not null default 0
);

-- One row per tweet whose commenters have been scraped.
create table if not exists public.scraped_tweets (
  tweet_id               text primary key,
  author_username        text not null,        -- lowercased handle
  reply_count_at_scrape  integer not null default 0,
  -- Highest reply id seen; the next scrape asks only for replies after it.
  newest_reply_id        text,
  times_scraped          integer not null default 1,
  first_scraped_at       timestamptz not null default now(),
  last_scraped_at        timestamptz not null default now()
);

create index if not exists scraped_tweets_author_idx on public.scraped_tweets (author_username);

alter table public.daily_scrape_profiles enable row level security;
alter table public.scraped_tweets enable row level security;

grant select, insert, update, delete on public.daily_scrape_profiles to service_role;
grant select, insert, update, delete on public.scraped_tweets to service_role;
