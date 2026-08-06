import { NextResponse } from "next/server";
import { parseTwitterUrl } from "@/lib/twitter/parseUrl";
import { fetchProfileConnectionsSplit } from "@/lib/apify/client";

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

  if (target.type !== "profile") {
    return NextResponse.json(
      { error: "Followers/following are only available for profile URLs" },
      { status: 400 }
    );
  }

  try {
    // One actor run returns both relations; split here so the two tabs never
    // need a second request.
    const connections = await fetchProfileConnectionsSplit(target.username);
    const followers = connections.filter((c) => c.relation === "followers");
    const following = connections.filter((c) => c.relation === "following");
    return NextResponse.json({ source: target, followers, following });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error while fetching connections";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
