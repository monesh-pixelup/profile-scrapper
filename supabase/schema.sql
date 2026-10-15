-- Also run supabase/migrations/002_daily_scrape_state.sql (daily cron state).

-- ICP leads captured by the scraper. Run this once in the Supabase SQL editor
-- (Dashboard → SQL Editor → New query) before setting the env vars.
--
-- Access goes exclusively through the Next.js API routes using the service
-- role key, so RLS is enabled with no policies: the anon key can't read or
-- write this table at all.

create extension if not exists pgcrypto;

create table if not exists public.icp_leads (
  id              uuid primary key default gen_random_uuid(),
  -- Lowercased handle, the dedupe key (X handles are case-insensitive).
  username        text not null unique,
  -- Handle as originally cased, for display.
  handle          text not null,
  name            text,
  description     text,
  profile_picture text,
  location        text,
  followers       integer not null default 0,
  following       integer not null default 0,

  icp_score       integer not null default 0,
  icp_tag         text,
  icp_signals     text[] not null default '{}',

  -- Where the lead was first found: follower | following | tweet_reply |
  -- top_icp | profile_scan | daily_scrape | manual. source_ref is the profile handle or
  -- tweet id that scrape was run against.
  source_type     text,
  source_ref      text,

  -- Outreach tracking. Never overwritten by the scraper, only by the dashboard.
  in_target_list  boolean not null default false,
  reached_out     boolean not null default false,
  reached_out_at  timestamptz,
  status          text not null default 'new'
                  check (status in ('new', 'contacted', 'replied', 'meeting', 'won', 'not_interested')),
  notes           text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now()
);

create index if not exists icp_leads_score_idx on public.icp_leads (icp_score desc);
create index if not exists icp_leads_target_idx on public.icp_leads (in_target_list) where in_target_list;
create index if not exists icp_leads_reached_out_idx on public.icp_leads (reached_out);

create or replace function public.icp_leads_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists icp_leads_set_updated_at on public.icp_leads;
create trigger icp_leads_set_updated_at
  before update on public.icp_leads
  for each row execute function public.icp_leads_set_updated_at();

alter table public.icp_leads enable row level security;

-- Explicit grant so the app's server key can use the table even if the
-- project was created with "automatically expose new tables" turned off.
grant select, insert, update, delete on public.icp_leads to service_role;
