"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import type { TwitterTweet, TwitterUser } from "@/lib/twitter/types";
import { parseTwitterUrl, type TwitterUrlTarget } from "@/lib/twitter/parseUrl";
import { buildTweetsWorkbookBlob } from "@/lib/export/tweetsWorkbook";

type Status = "idle" | "loading" | "error";
type View = "people" | "tweets";

function formatCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(count);
}

function formatDate(raw: string): string {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [submittedUrl, setSubmittedUrl] = useState("");
  const [source, setSource] = useState<TwitterUrlTarget | null>(null);
  const [view, setView] = useState<View>("tweets");

  const [sendStatus, setSendStatus] = useState<Status>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [profiles, setProfiles] = useState<TwitterUser[]>([]);
  const [peopleStatus, setPeopleStatus] = useState<Status>("idle");
  const [peopleError, setPeopleError] = useState<string | null>(null);

  const [tweets, setTweets] = useState<TwitterTweet[]>([]);
  const [tweetsStatus, setTweetsStatus] = useState<Status>("idle");
  const [tweetsError, setTweetsError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Refs (not state) so the "already fetching / already fetched" checks are
  // synchronous — state updates land on the next render, which leaves a gap
  // a fast double-click could slip through and fire a second paid API call.
  const isSubmittingRef = useRef(false);
  const peopleFetchedForRef = useRef<string | null>(null);
  const tweetsFetchedForRef = useRef<string | null>(null);

  const fetchPeople = async (forUrl: string) => {
    if (peopleFetchedForRef.current === forUrl) return;
    peopleFetchedForRef.current = forUrl;

    setPeopleStatus("loading");
    setPeopleError(null);

    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: forUrl }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Something went wrong");
      }

      setProfiles(data.profiles ?? []);
      setPeopleStatus("idle");
    } catch (err) {
      setPeopleError(err instanceof Error ? err.message : "Something went wrong");
      setPeopleStatus("error");
      // Allow retrying after a failure — only a successful fetch should
      // permanently lock this URL out of future calls.
      peopleFetchedForRef.current = null;
    }
  };

  const fetchTweets = async (forUrl: string) => {
    if (tweetsFetchedForRef.current === forUrl) return;
    tweetsFetchedForRef.current = forUrl;

    setTweetsStatus("loading");
    setTweetsError(null);

    try {
      const res = await fetch("/api/tweets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: forUrl }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Something went wrong");
      }

      setTweets(data.tweets ?? []);
      setTweetsStatus("idle");
    } catch (err) {
      setTweetsError(err instanceof Error ? err.message : "Something went wrong");
      setTweetsStatus("error");
      tweetsFetchedForRef.current = null;
    }
  };

  const handleSend = async () => {
    const trimmed = url.trim();
    if (!trimmed || isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    setSendStatus("loading");
    setSubmitError(null);
    setSubmittedUrl(trimmed);
    setSource(null);
    setProfiles([]);
    setTweets([]);
    setPeopleStatus("idle");
    setTweetsStatus("idle");
    setPeopleError(null);
    setTweetsError(null);
    peopleFetchedForRef.current = null;
    tweetsFetchedForRef.current = null;

    const target = parseTwitterUrl(trimmed);
    if (!target) {
      setSubmitError("Could not extract a profile username or a tweet ID from that URL");
      setSendStatus("error");
      isSubmittingRef.current = false;
      return;
    }

    setSource(target);
    setSendStatus("idle");

    // Profile URLs default to Latest Tweets; post URLs only ever have a
    // People (interactions) view. Either way, only the relevant paid API
    // call is made — the other one stays lazy until its tab is picked.
    if (target.type === "profile") {
      setView("tweets");
      await fetchTweets(trimmed);
    } else {
      setView("people");
      await fetchPeople(trimmed);
    }

    isSubmittingRef.current = false;
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSend();
  };

  const handleSelectPeople = () => {
    setView("people");
    fetchPeople(submittedUrl);
  };

  const handleSelectTweets = () => {
    setView("tweets");
    fetchTweets(submittedUrl);
  };

  const handleDownloadTweets = async () => {
    if (isDownloading || tweets.length === 0 || source?.type !== "profile") return;
    setIsDownloading(true);

    try {
      // Purely client-side: builds the workbook from tweets already held in
      // state, no network request involved.
      const blob = await buildTweetsWorkbookBlob(tweets, source.username);
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${source.username}-latest-tweets.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(objectUrl);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-4 py-16 font-sans dark:bg-black">
      <h1 className="mb-6 text-2xl font-semibold text-zinc-800 dark:text-zinc-100">
        Paste a profile URL
      </h1>

      <div className="flex w-full max-w-2xl items-center gap-2 rounded-2xl border border-zinc-200 bg-white p-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Paste a URL here..."
          className="flex-1 bg-transparent px-3 py-2 text-sm text-zinc-800 outline-none placeholder:text-zinc-400 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />
        <button
          onClick={handleSend}
          disabled={!url.trim() || sendStatus === "loading"}
          aria-label="Send"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white transition-colors hover:bg-zinc-700 disabled:opacity-40 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {sendStatus === "loading" ? (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <path d="M12 4l-8 8h5v8h6v-8h5z" />
            </svg>
          )}
        </button>
      </div>

      {submitError && <p className="mt-4 max-w-2xl text-sm text-red-500">{submitError}</p>}

      {source?.type === "profile" && (
        <div className="mt-6 flex gap-1 rounded-full border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900">
          <button
            onClick={handleSelectPeople}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              view === "people"
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            People
          </button>
          <button
            onClick={handleSelectTweets}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              view === "tweets"
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            Latest Tweets
          </button>
        </div>
      )}

      {source && view === "people" && (
        <>
          {peopleStatus === "loading" && (
            <p className="mt-8 text-center text-sm text-zinc-400">Loading people…</p>
          )}

          {peopleError && <p className="mt-4 max-w-2xl text-sm text-red-500">{peopleError}</p>}

          {profiles.length > 0 && (
            <div className="mt-8 w-full max-w-2xl space-y-3">
              {profiles.map((profile) => (
                <a
                  key={profile.userName}
                  href={`https://x.com/${profile.userName}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-3 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={profile.profilePicture}
                    alt={profile.name}
                    className="h-10 w-10 shrink-0 rounded-full object-cover"
                  />
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="truncate font-medium text-zinc-800 dark:text-zinc-100">
                        {profile.name}
                      </span>
                      <span className="shrink-0 text-sm text-zinc-400">@{profile.userName}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">
                      {profile.description}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          )}

          {peopleStatus === "idle" && profiles.length === 0 && !peopleError && (
            <p className="mt-8 text-sm text-zinc-400">
              Design-related accounts from their followers/following will show up here.
            </p>
          )}
        </>
      )}

      {source && view === "tweets" && (
        <div className="mt-8 w-full max-w-2xl">
          {tweetsStatus === "loading" && (
            <p className="text-center text-sm text-zinc-400">Loading latest tweets…</p>
          )}

          {tweetsError && <p className="text-sm text-red-500">{tweetsError}</p>}

          {tweetsStatus === "idle" && tweets.length > 0 && (
            <div className="mb-3 flex justify-end">
              <button
                onClick={handleDownloadTweets}
                disabled={isDownloading}
                className="flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-900 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:text-white"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
                </svg>
                {isDownloading ? "Preparing…" : "Download .xlsx"}
              </button>
            </div>
          )}

          {tweetsStatus === "idle" && tweets.length > 0 && (
            <div className="space-y-3">
              {tweets.map((tweet) => (
                <a
                  key={tweet.id}
                  href={tweet.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl border border-zinc-200 bg-white p-3 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
                >
                  <p className="whitespace-pre-wrap text-sm text-zinc-800 dark:text-zinc-100">
                    {tweet.text}
                  </p>
                  <div className="mt-2 flex items-center gap-4 text-xs text-zinc-400">
                    <span>{formatDate(tweet.createdAt)}</span>
                    <span>{formatCount(tweet.replyCount)} replies</span>
                    <span>{formatCount(tweet.retweetCount)} retweets</span>
                    <span>{formatCount(tweet.quoteCount)} quotes</span>
                    <span>{formatCount(tweet.likeCount)} likes</span>
                    <span>{formatCount(tweet.viewCount)} views</span>
                  </div>
                </a>
              ))}
            </div>
          )}

          {tweetsStatus === "idle" && tweets.length === 0 && !tweetsError && (
            <p className="text-center text-sm text-zinc-400">No tweets found.</p>
          )}
        </div>
      )}
    </div>
  );
}
