"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import type { TwitterTweet } from "@/lib/twitter/types";
import { parseTwitterUrl, type TwitterUrlTarget } from "@/lib/twitter/parseUrl";
import { buildTweetsWorkbookBlob } from "@/lib/export/tweetsWorkbook";

type Status = "idle" | "loading" | "error";

const PAGE_SIZE = 25;

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
  const [source, setSource] = useState<TwitterUrlTarget | null>(null);

  const [sendStatus, setSendStatus] = useState<Status>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [tweets, setTweets] = useState<TwitterTweet[]>([]);
  const [tweetsStatus, setTweetsStatus] = useState<Status>("idle");
  const [tweetsError, setTweetsError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // Refs (not state) so the "already fetching / already fetched" checks are
  // synchronous — state updates land on the next render, which leaves a gap
  // a fast double-click could slip through and fire a second paid API call.
  const isSubmittingRef = useRef(false);
  const tweetsFetchedForRef = useRef<string | null>(null);

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
      setCurrentPage(1);
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
    setSource(null);
    setTweets([]);
    setTweetsStatus("idle");
    setTweetsError(null);
    setCurrentPage(1);
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
    await fetchTweets(trimmed);

    isSubmittingRef.current = false;
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSend();
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

      {source && (
        <div className="mt-8 w-full max-w-6xl">
          {tweetsStatus === "loading" && (
            <p className="text-center text-sm text-zinc-400">Loading latest tweets…</p>
          )}

          {tweetsError && <p className="text-sm text-red-500">{tweetsError}</p>}

          {tweetsStatus === "idle" && tweets.length > 0 && (
            <>
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

              <TweetsTable
                tweets={tweets}
                username={source?.type === "profile" ? source.username : undefined}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
              />
            </>
          )}

          {tweetsStatus === "idle" && tweets.length === 0 && !tweetsError && (
            <p className="text-center text-sm text-zinc-400">No tweets found.</p>
          )}
        </div>
      )}
    </div>
  );
}

function TweetsTable({
  tweets,
  username,
  currentPage,
  onPageChange,
}: {
  tweets: TwitterTweet[];
  username?: string;
  currentPage: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(tweets.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageTweets = tweets.slice(start, start + PAGE_SIZE);

  return (
    <div className="w-full">
      <div className="w-full overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-225 border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              <th className="px-3 py-2 font-medium">Username</th>
              <th className="px-3 py-2 font-medium">Tweet Link</th>
              <th className="px-3 py-2 font-medium">Tweet Text</th>
              <th className="px-3 py-2 font-medium">Likes</th>
              <th className="px-3 py-2 font-medium">Comments</th>
              <th className="px-3 py-2 font-medium">Retweets</th>
              <th className="px-3 py-2 font-medium">Quotes</th>
              <th className="px-3 py-2 font-medium">Views</th>
              <th className="px-3 py-2 font-medium">Posted Date</th>
            </tr>
          </thead>
          <tbody>
            {pageTweets.map((tweet) => (
              <tr
                key={tweet.id}
                className="border-b border-zinc-100 bg-white last:border-0 hover:bg-zinc-50 dark:border-zinc-900 dark:bg-zinc-950 dark:hover:bg-zinc-900"
              >
                <td className="px-3 py-2 whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                  {username ? `@${username}` : "—"}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <a
                    href={tweet.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline dark:text-blue-400"
                  >
                    View tweet
                  </a>
                </td>
                <td className="max-w-md min-w-[16rem] px-3 py-2 whitespace-pre-wrap text-zinc-800 dark:text-zinc-100">
                  {tweet.text}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-zinc-600 dark:text-zinc-300">
                  {formatCount(tweet.likeCount)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-zinc-600 dark:text-zinc-300">
                  {formatCount(tweet.replyCount)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-zinc-600 dark:text-zinc-300">
                  {formatCount(tweet.retweetCount)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-zinc-600 dark:text-zinc-300">
                  {formatCount(tweet.quoteCount)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-zinc-600 dark:text-zinc-300">
                  {formatCount(tweet.viewCount)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                  {formatDate(tweet.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
          <span>
            Page {safePage} of {totalPages} ({tweets.length} tweets)
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(Math.max(1, safePage - 1))}
              disabled={safePage <= 1}
              className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-900 disabled:opacity-40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:text-white"
            >
              Previous
            </button>
            <button
              onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
              disabled={safePage >= totalPages}
              className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-900 disabled:opacity-40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:text-white"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
