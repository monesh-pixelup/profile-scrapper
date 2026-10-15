import { NextResponse } from "next/server";
import { parseTwitterUrl } from "@/lib/twitter/parseUrl";
import { fetchProfileConnections, fetchTweetQuoters, fetchTweetRepliers } from "@/lib/apify/client";
import { filterDesignProfiles } from "@/lib/twitter/filter";
import { saveIcpLeadsAfterResponse } from "@/lib/leads/store";
import type { TwitterUser } from "@/lib/twitter/types";

export async function POST(request: Request) {
  let body: { url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawUrl = body.url?.trim();
  if (!rawUrl) {
    return NextResponse.json({ error: "Missing 'url' in request body" }, { status: 400 });
  }

  const target = parseTwitterUrl(rawUrl);
  if (!target) {
    return NextResponse.json(
      { error: "Could not extract a profile username or a tweet ID from that URL" },
      { status: 400 }
    );
  }

  try {
    if (target.type === "profile") {
      const connections = await fetchProfileConnections(target.username);
      const profiles = filterDesignProfiles(connections);
      saveIcpLeadsAfterResponse(profiles, { type: "profile_scan", ref: target.username });
      return NextResponse.json({ source: target, profiles });
    }

    // Apify actor runs are independent HTTP calls (no shared per-second rate
    // limit like twitterapi.io's free tier), so these can run in parallel.
    const [quoters, repliersResult] = await Promise.all([
      fetchTweetQuoters(target.tweetId),
      fetchTweetRepliers(target.tweetId),
    ]);

    const replierUsers = repliersResult.repliers
      .map((replier) => replier.user)
      .filter((user): user is TwitterUser => user !== null);
    const profiles = filterDesignProfiles([...quoters, ...replierUsers]);
    saveIcpLeadsAfterResponse(profiles, { type: "profile_scan", ref: target.tweetId });
    return NextResponse.json({ source: target, profiles });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error while fetching profiles";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
