-- Outreach sourcing: signals history, monitored sources, run log, config and
-- previous clients. Run in the Supabase SQL editor after schema.sql and 002.

-- 1. Lead-level signal summary (maintained by the trigger below) -----------
alter table public.icp_leads
  add column if not exists x_user_id          text,
  add column if not exists first_signal_source text,
  add column if not exists first_signal_at     timestamptz,
  add column if not exists signal_count        integer not null default 0,
  add column if not exists latest_signal_at    timestamptz;

create unique index if not exists icp_leads_x_user_id_idx
  on public.icp_leads (x_user_id) where x_user_id is not null;

-- 2. Signals: append-only, one row per engagement event ---------------------
create table if not exists public.signals (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid not null references public.icp_leads (id) on delete cascade,
  source          text not null
                  check (source in ('new_follower', 'post_like', 'competitor_follower', 'vc_comment', 'designer_comment')),
  source_ref      text not null,
  detail          text,
  captured_at     timestamptz not null default now(),
  captured_by     text not null check (captured_by in ('apify', 'extension')),
  comment_quality text check (comment_quality in ('substantive')),
  -- Dedupe key: a re-run or re-follow can never add the same signal twice.
  unique (lead_id, source, source_ref)
);

create index if not exists signals_lead_idx on public.signals (lead_id);
create index if not exists signals_source_idx on public.signals (source, captured_at desc);

-- Keep the lead summary in step. The first signal is set once and never
-- overwritten; signal_count and latest_signal_at are recomputed.
create or replace function public.signals_sync_lead()
returns trigger
language plpgsql
as $$
begin
  update public.icp_leads l
     set signal_count        = (select count(*) from public.signals s where s.lead_id = new.lead_id),
         latest_signal_at    = greatest(coalesce(l.latest_signal_at, new.captured_at), new.captured_at),
         first_signal_source = coalesce(l.first_signal_source, new.source),
         first_signal_at     = coalesce(l.first_signal_at, new.captured_at)
   where l.id = new.lead_id;
  return new;
end;
$$;

drop trigger if exists signals_sync_lead on public.signals;
create trigger signals_sync_lead
  after insert on public.signals
  for each row execute function public.signals_sync_lead();

-- 3. Monitored accounts -----------------------------------------------------
create table if not exists public.sources (
  handle      text primary key,                 -- lowercased, no @
  type        text not null check (type in ('own', 'competitor', 'vc', 'designer')),
  active      boolean not null default true,
  last_run_at timestamptz,
  anchor_ids  jsonb not null default '[]'::jsonb
);

-- 4. Run log: one row per run ----------------------------------------------
create table if not exists public.runs (
  id               uuid primary key default gen_random_uuid(),
  source           text not null,
  runner           text not null check (runner in ('apify', 'extension')),
  started_at       timestamptz not null default now(),
  records_received integer not null default 0,
  new_leads        integer not null default 0,
  new_signals      integer not null default 0,
  errors           integer not null default 0,
  flags            text[] not null default '{}',
  cost_usd         numeric(10, 4)
);

create index if not exists runs_started_idx on public.runs (started_at desc);

-- 5. Config: every threshold, tunable without a deploy ---------------------
create table if not exists public.config (
  key        text primary key,
  value      text not null default '',
  group_name text not null,
  hint       text not null default ''
);

insert into public.config (key, value, group_name, hint) values
  ('follower_run_cap', '300', 'Collection', 'Stops runaway scrolling when no anchor is found'),
  ('competitor_backfill_cap', '3000', 'Collection', 'Newest followers are the freshest signal'),
  ('like_regrowth_pct', '30', 'Collection', 'Skip posts that barely changed'),
  ('listen_post_window_hours', '72', 'Listening', 'Older threads are dead'),
  ('listen_min_replies', '20', 'Listening', 'Quiet posts have no ICP-rich thread'),
  ('listen_max_posts_per_account', '5', 'Listening', 'Cost control'),
  ('listen_max_replies_per_post', '200', 'Listening', 'Cost control'),
  ('commenter_min_words', '4', 'Filters', 'Drops gm and emoji-only replies'),
  ('commenter_min_followers', '50', 'Filters', 'Bot filter only'),
  ('require_bio_and_avatar', 'true', 'Filters', 'Bot filter')
on conflict (key) do nothing;

-- 6. Previous clients -------------------------------------------------------
create table if not exists public.previous_clients (
  handle text primary key                       -- lowercased, no @
);

insert into public.previous_clients (handle) values
  ('dakshgup'),
  ('soohoonchoi'),
  ('vaishaaant'),
  ('greptileai'),
  ('zaygranet'),
  ('sobhan_nejad'),
  ('usebland'),
  ('abrahamadit'),
  ('raunakdoesdev'),
  ('reductoai'),
  ('omar_or_ahmed'),
  ('sullyai'),
  ('cyrilgorlla'),
  ('ctgtinc'),
  ('ay_ushr'),
  ('johnyeo_'),
  ('autumnpricing'),
  ('tylermaran'),
  ('monumintcom'),
  ('landseerenga'),
  ('anamhira'),
  ('tryrevyl'),
  ('iamsupreetd'),
  ('sahitya0808'),
  ('rajashekarv95'),
  ('synthiolabs'),
  ('liuzjerry'),
  ('henrylabs'),
  ('zenactai'),
  ('chrissesi')
on conflict (handle) do nothing;

-- 7. Access: service role only (RLS on, no public policies) ----------------
alter table public.signals enable row level security;
alter table public.sources enable row level security;
alter table public.runs enable row level security;
alter table public.config enable row level security;
alter table public.previous_clients enable row level security;

grant select, insert, update, delete on public.signals to service_role;
grant select, insert, update, delete on public.sources to service_role;
grant select, insert, update, delete on public.runs to service_role;
grant select, insert, update, delete on public.config to service_role;
grant select, insert, update, delete on public.previous_clients to service_role;
