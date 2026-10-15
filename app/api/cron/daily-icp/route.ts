import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getConfiguredProfiles, resolveProfiles, runDailyIcpScrape } from "@/lib/cron/dailyIcp";

// Vercel Hobby (with Fluid compute) allows up to 300s; Pro allows more.
export const maxDuration = 300;

// Stop starting new Apify calls this long before maxDuration, leaving time
// for in-flight calls to finish and leads to be saved.
const SAFETY_MARGIN_MS = 60_000;

// Triggered daily by Vercel Cron (see vercel.json), which sends
// `Authorization: Bearer $CRON_SECRET`. Can also be run manually:
//   curl -H "Authorization: Bearer <CRON_SECRET>" https://<app>/api/cron/daily-icp
// Optional `?profiles=a,b` overrides the configured list (handy for testing
// one profile without paying for the whole list).
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured — nothing to save leads to" }, { status: 500 });
  }

  const override = new URL(request.url).searchParams.get("profiles");
  const usernames = override ? resolveProfiles(override.split(",")) : getConfiguredProfiles();
  if (usernames.length === 0) {
    return NextResponse.json({
      message: "No profiles configured. Add some to config/daily-scrape.ts or DAILY_SCRAPE_PROFILES.",
      profiles: [],
    });
  }

  const deadline = Date.now() + maxDuration * 1000 - SAFETY_MARGIN_MS;
  const result = await runDailyIcpScrape(usernames, deadline);
  console.log(
    `[daily-icp] done: ${usernames.length} profiles, ${result.totalIcpLeadsSaved} ICP leads saved, ` +
      `~$${result.totalEstSpendUsd} est. Apify spend, ${result.durationMs}ms`
  );

  const allFailed = result.profiles.every((p) => !p.ok);
  return NextResponse.json(result, { status: allFailed ? 502 : 200 });
}
