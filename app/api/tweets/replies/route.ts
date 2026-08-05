import { NextResponse } from "next/server";
import { fetchTweetRepliers } from "@/lib/apify/client";

export async function POST(request: Request) {
  let body: { tweetId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const tweetId = body.tweetId?.trim();
  if (!tweetId) {
    return NextResponse.json({ error: "Missing 'tweetId' in request body" }, { status: 400 });
  }

  try {
    const { repliers, rawCount } = await fetchTweetRepliers(tweetId);
    return NextResponse.json({ repliers, rawCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error while fetching repliers";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
