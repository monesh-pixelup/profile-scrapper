import { NextResponse } from "next/server";
import { fetchRepliersForTweets } from "@/lib/apify/client";
import { saveIcpLeadsAfterResponse } from "@/lib/leads/store";
import type { TwitterUser } from "@/lib/twitter/types";

// Total dollar budget for a single Top ICP scrape, spent across as many of
// the (highest-comments-first) tweets as it'll cover — matches the cap used
// for the Following/Followers scrape.
const TOP_ICP_BUDGET_USD = 1;

export async function POST(request: Request) {
  // `username` is the profile the tweets belong to — optional, only used to
  // record where saved ICP leads came from.
  let body: { tweets?: { id?: unknown; replyCount?: unknown }[]; username?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const tweets = (body.tweets ?? [])
    .filter(
      (t): t is { id: string; replyCount: number } =>
        typeof t.id === "string" && typeof t.replyCount === "number"
    );

  if (tweets.length === 0) {
    return NextResponse.json({ error: "Missing or empty 'tweets' in request body" }, { status: 400 });
  }

  try {
    const result = await fetchRepliersForTweets(tweets, TOP_ICP_BUDGET_USD);
    saveIcpLeadsAfterResponse(
      result.repliers.map((r) => r.user).filter((user): user is TwitterUser => user !== null),
      { type: "top_icp", ref: typeof body.username === "string" ? body.username : undefined }
    );
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error while scraping commenters";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
