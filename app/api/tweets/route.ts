import { NextResponse } from "next/server";
import { parseTwitterUrl } from "@/lib/twitter/parseUrl";
import { fetchLatestTweets } from "@/lib/apify/client";

export async function POST(request: Request) {
  let body: { url?: string; maxItems?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawUrl = body.url?.trim();
  if (!rawUrl) {
    return NextResponse.json({ error: "Missing 'url' in request body" }, { status: 400 });
  }

  let maxItems: number | undefined;
  if (body.maxItems !== undefined) {
    if (!Number.isInteger(body.maxItems) || body.maxItems < 1) {
      return NextResponse.json(
        { error: "'maxItems' must be a positive whole number" },
        { status: 400 }
      );
    }
    maxItems = body.maxItems;
  }

  const target = parseTwitterUrl(rawUrl);
  if (!target) {
    return NextResponse.json(
      { error: "Could not extract a profile username or a tweet ID from that URL" },
      { status: 400 }
    );
  }

  if (target.type !== "profile") {
    return NextResponse.json(
      { error: "Latest tweets are only available for profile URLs" },
      { status: 400 }
    );
  }

  try {
    const tweets = await fetchLatestTweets(target.username, maxItems);
    return NextResponse.json({ source: target, tweets });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error while fetching tweets";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
