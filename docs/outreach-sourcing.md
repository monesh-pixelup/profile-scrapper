# X outreach sourcing

Finds people who fit the ICP from five touchpoints on X, stores each person
with a permanent record of **the signal that surfaced them**, and shows it all
in the app. Deciding who to contact, what to send and sending are out of scope.

## How it fits together

```
Apify actors (scheduled) ──POST──┐
                                 ├──> /api/outreach/ingest ──> Supabase ──> dashboard
Chrome extension (manual) ──POST─┘
```

The Next.js app is the only writer. Senders post batches; the route owns
dedupe, noise filters and the run log. It replaces the Google Sheet and Apps
Script in the original brief.

## Pillars

| # | Pillar | `source` value | Runner | Cadence |
|---|---|---|---|---|
| 1 | New followers | `new_follower` | Extension | Manual, about daily |
| 2 | Post likers | `post_like` | Extension | Manual, per post |
| 3 | Competitor followers | `competitor_follower` | Apify | Weekly |
| 4 | VC and founder comments | `vc_comment` | Apify | Daily |
| 5 | Designer comments | `designer_comment` | Apify | Daily |

Static pillar descriptions live in `lib/outreach/model.ts` (`PILLARS`). Live
state (last run, status) is derived from the run log and config.

The Contra jobs pillar was removed.

## Setup

1. Run `supabase/migrations/003_outreach_signals.sql` in the Supabase SQL editor
   (after `schema.sql` and `002_daily_scrape_state.sql`). It seeds the default
   config values and the previous-clients list.
2. Environment variables (`.env.local`):
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (already used by the app)
   - `INGEST_SECRET`: shared secret senders must present
3. Until the migration is applied, the new pages show a setup notice instead of data.

## Data model

Added by migration 003 (all service-role only, RLS on):

| Table | Purpose |
|---|---|
| `icp_leads` (existing) | One row per person. New columns: `x_user_id`, `first_signal_source`, `first_signal_at`, `signal_count`, `latest_signal_at`. |
| `signals` | Append-only, one row per engagement event. Unique on `(lead_id, source, source_ref)`. |
| `sources` | Monitored accounts: `handle`, `type` (`own` / `competitor` / `vc` / `designer`), `active`, `last_run_at`, `anchor_ids`. |
| `runs` | One row per ingest call: counts, flags, errors, cost. |
| `config` | Every tunable threshold. |
| `previous_clients` | Handles of past clients, shown on Sources and tagged on leads. |

A trigger on `signals` keeps `signal_count` and `latest_signal_at` current and
sets `first_signal_*` once, never overwriting it.

## Ingest API

`POST /api/outreach/ingest`

Auth: `Authorization: Bearer $INGEST_SECRET` (or `x-ingest-secret`).

```json
{
  "source": "vc_comment",
  "runner": "apify",
  "records": [
    {
      "handle": "someone",
      "x_user_id": "123",
      "name": "Some One",
      "bio": "Founder at X",
      "followers": 1200,
      "following": 300,
      "location": "Berlin",
      "profile_picture": "https://...",
      "source_ref": "https://x.com/ycombinator/status/1844",
      "detail": "comment text",
      "captured_at": "2026-10-15T07:30:00Z"
    }
  ],
  "flags": ["anchor_not_found"],
  "errors": 0,
  "costUsd": 0.92
}
```

- Send batches of 100 to 200 records. The hard cap is 500 per request.
- Safe to call twice with the same payload: it adds no new leads or signals.
- Existing leads are never modified, so `first_signal_*`, `status` and `notes` are safe.
- Response: `{ received, accepted, newLeads, newSignals, runId }`.
- Every call writes a `runs` row. Records dropped by the noise filters are
  recorded as a `filtered_N` flag.
- For comment sources, `comment_quality` is set to `substantive` when the
  comment is 20+ words or contains a question, unless the sender supplies it.

### Filters and the ICP gate

`lib/outreach/gate.ts` runs between ingestion and the leads table:

1. `filterNoise`: reads `commenter_min_followers`, `commenter_min_words` and
   `require_bio_and_avatar` from the config table. Applies to competitor
   followers and both comment sources.
2. `icpGate`: a stub that passes everyone through. Plug the real ICP rule in
   here and read its settings from `config`. Do not hardcode ICP logic elsewhere.

## Other API routes

| Route | Use |
|---|---|
| `GET/POST/PATCH /api/outreach/sources` | List, add `{handle, type}`, pause or resume `{handle, active}` |
| `GET/PUT /api/outreach/config` | Read thresholds, update `{values: {key: value}}`. Takes effect on the next ingest. |
| `PATCH /api/leads/[id]` (existing) | Edit a lead's `status` and `notes` from the Leads drawer |

Pillar pause flags are stored as `pillar_paused_<source>` in `config`.

## UI

| Route | What it shows |
|---|---|
| `/` | KPI cards, signals per day, signals by pillar, top leads, attention list, recent runs |
| `/signals`, `/signals/[pillar]` | Pillar cards. Pillar page has Overview, Leads, Runs and Thresholds tabs |
| `/leads` | Filterable table. Drawer shows the append-only signal history and edits status and notes |
| `/sources` | Monitored accounts by type, add and pause. Previous clients are listed read-only |
| `/runs` | Run log with flags and cost |
| `/settings` | Thresholds, plus the ICP gate status |
| `/scraper`, `/dashboard` | The earlier profile scraper and ICP dashboard, unchanged |

Pages read with the Supabase service role on the server (`lib/outreach/store.ts`)
and are rendered dynamically inside `<Suspense>`.

## Not built yet

- **Senders.** The Apify actors and the Chrome extension do not exist yet. Until
  they do, data can be loaded by calling the ingest route directly.
- **Run now.** The buttons on pillar pages are disabled; runs are started by Apify
  schedules or the extension, not from the UI.
- **Anchor logic.** `sources.anchor_ids` exists, but the sender must read and
  write it. The ingest route only stamps `last_run_at`.
- **Likes regrowth and reply revisits.** Post tracking (`like_regrowth_pct`,
  24h revisit) is the sender's job; `scraped_tweets` already tracks tweets for
  the existing daily cron.
- **Archiving.** Plan to archive old `signals` rows if the table grows large.
- **Paging.** The leads list is capped at 1000 rows per load.
