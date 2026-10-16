# Profile Scrapper

Next.js app for scraping X profiles, scoring them against an ICP, and sourcing
outreach leads from five signal pillars.

- **Outreach sourcing** (`/`, `/signals`, `/leads`, `/sources`, `/runs`, `/settings`): see
  [docs/outreach-sourcing.md](docs/outreach-sourcing.md) for setup, the ingest API and the data model.
- **Profile scraper** (`/scraper`) and **ICP dashboard** (`/dashboard`): the original tools.
- **Design system**: [design-system.md](design-system.md).

## Develop

```bash
pnpm install
pnpm dev
```

Environment variables (`.env.local`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`INGEST_SECRET`, `CRON_SECRET`, plus the Apify and Anthropic keys the scraper uses.
Apply the SQL in `supabase/` in order (`schema.sql`, then `migrations/`).

This project uses a Next.js version with breaking changes; read `node_modules/next/dist/docs/` before changing framework-level code.
