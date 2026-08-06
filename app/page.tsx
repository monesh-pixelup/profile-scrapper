"use client";

import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import type { TweetReplier, TwitterConnection, TwitterTweet } from "@/lib/twitter/types";
import { parseTwitterUrl, type TwitterUrlTarget } from "@/lib/twitter/parseUrl";
import { buildTweetsWorkbookBlob } from "@/lib/export/tweetsWorkbook";
import { scoreProfile } from "@/lib/icp/score";

// Mirrors LATEST_TWEETS_MAX_ITEMS in lib/apify/client.ts (the server-side
// default used when the field below is left blank) — kept as a plain
// constant here rather than importing that module, since it pulls in
// server-only Apify client code that has no business in the client bundle.
const DEFAULT_TWEETS_LIMIT = 1200;

type Status = "idle" | "loading" | "error";
type Tab = "tweets" | "following" | "followers";

const PAGE_SIZE = 25;

const TABS: { key: Tab; label: string }[] = [
  { key: "tweets", label: "Latest Tweets" },
  { key: "following", label: "Following" },
  { key: "followers", label: "Followers" },
];

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
  const [tweetsLimitInput, setTweetsLimitInput] = useState("");
  const [source, setSource] = useState<TwitterUrlTarget | null>(null);

  const [sendStatus, setSendStatus] = useState<Status>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [tweets, setTweets] = useState<TwitterTweet[]>([]);
  const [tweetsStatus, setTweetsStatus] = useState<Status>("idle");
  const [tweetsError, setTweetsError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const [activeTab, setActiveTab] = useState<Tab>("tweets");
  const [following, setFollowing] = useState<TwitterConnection[]>([]);
  const [followers, setFollowers] = useState<TwitterConnection[]>([]);
  const [connectionsStatus, setConnectionsStatus] = useState<Status>("idle");
  const [connectionsError, setConnectionsError] = useState<string | null>(null);
  const [connectionsPage, setConnectionsPage] = useState(1);

  const [selectedTweet, setSelectedTweet] = useState<TwitterTweet | null>(null);
  const [repliersByTweet, setRepliersByTweet] = useState<Record<string, TweetReplier[]>>({});
  const [repliersRawCountByTweet, setRepliersRawCountByTweet] = useState<Record<string, number>>({});
  const [repliersStatus, setRepliersStatus] = useState<Record<string, Status>>({});
  const [repliersError, setRepliersError] = useState<Record<string, string>>({});

  // Refs (not state) so the "already fetching / already fetched" checks are
  // synchronous — state updates land on the next render, which leaves a gap
  // a fast double-click could slip through and fire a second paid API call.
  const isSubmittingRef = useRef(false);
  const tweetsFetchedForRef = useRef<string | null>(null);
  const repliersFetchedForRef = useRef<Set<string>>(new Set());
  // One combined call returns both followers and following, so this guard
  // covers both tabs — switching between them never refetches.
  const connectionsFetchedForRef = useRef<string | null>(null);

  const fetchTweets = async (forUrl: string, maxItems?: number) => {
    if (tweetsFetchedForRef.current === forUrl) return;
    tweetsFetchedForRef.current = forUrl;

    setTweetsStatus("loading");
    setTweetsError(null);

    try {
      const res = await fetch("/api/tweets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: forUrl, ...(maxItems !== undefined ? { maxItems } : {}) }),
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

    // New profile: default back to the Tweets tab and drop any
    // previously-fetched followers/following so the next tab switch fetches
    // fresh data for this URL.
    setActiveTab("tweets");
    setFollowing([]);
    setFollowers([]);
    setConnectionsStatus("idle");
    setConnectionsError(null);
    setConnectionsPage(1);
    connectionsFetchedForRef.current = null;

    const target = parseTwitterUrl(trimmed);
    if (!target) {
      setSubmitError("Could not extract a profile username or a tweet ID from that URL");
      setSendStatus("error");
      isSubmittingRef.current = false;
      return;
    }

    const trimmedLimit = tweetsLimitInput.trim();
    let maxItems: number | undefined;
    if (trimmedLimit) {
      const parsed = Number(trimmedLimit);
      if (!Number.isInteger(parsed) || parsed < 1) {
        setSubmitError("Tweets to fetch must be a positive whole number");
        setSendStatus("error");
        isSubmittingRef.current = false;
        return;
      }
      maxItems = parsed;
    }

    setSource(target);
    setSendStatus("idle");
    await fetchTweets(trimmed, maxItems);

    isSubmittingRef.current = false;
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleSend();
  };

  const fetchConnections = async (forUrl: string) => {
    if (connectionsFetchedForRef.current === forUrl) return;
    connectionsFetchedForRef.current = forUrl;

    setConnectionsStatus("loading");
    setConnectionsError(null);

    try {
      const res = await fetch("/api/profiles/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: forUrl }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Something went wrong");
      }

      setFollowing(data.following ?? []);
      setFollowers(data.followers ?? []);
      setConnectionsStatus("idle");
      setConnectionsPage(1);
    } catch (err) {
      setConnectionsError(err instanceof Error ? err.message : "Something went wrong");
      setConnectionsStatus("error");
      connectionsFetchedForRef.current = null;
    }
  };

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    if ((tab === "following" || tab === "followers") && source) {
      fetchConnections(source.type === "profile" ? source.username : url.trim());
    }
  };

  const fetchRepliers = async (tweetId: string) => {
    if (repliersFetchedForRef.current.has(tweetId)) return;
    repliersFetchedForRef.current.add(tweetId);

    setRepliersStatus((prev) => ({ ...prev, [tweetId]: "loading" }));
    setRepliersError((prev) => {
      const next = { ...prev };
      delete next[tweetId];
      return next;
    });

    try {
      const res = await fetch("/api/tweets/replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tweetId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Something went wrong");
      }

      setRepliersByTweet((prev) => ({ ...prev, [tweetId]: data.repliers ?? [] }));
      setRepliersRawCountByTweet((prev) => ({ ...prev, [tweetId]: data.rawCount ?? 0 }));
      setRepliersStatus((prev) => ({ ...prev, [tweetId]: "idle" }));
    } catch (err) {
      setRepliersError((prev) => ({
        ...prev,
        [tweetId]: err instanceof Error ? err.message : "Something went wrong",
      }));
      setRepliersStatus((prev) => ({ ...prev, [tweetId]: "error" }));
      repliersFetchedForRef.current.delete(tweetId);
    }
  };

  const handleTweetClick = (tweet: TwitterTweet) => {
    setSelectedTweet(tweet);
    fetchRepliers(tweet.id);
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

      <div className="mt-3 flex w-full max-w-2xl items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <label htmlFor="tweetsLimit">Tweets to fetch:</label>
        <input
          id="tweetsLimit"
          type="number"
          min={1}
          step={1}
          value={tweetsLimitInput}
          onChange={(e) => setTweetsLimitInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={String(DEFAULT_TWEETS_LIMIT)}
          className="w-28 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-zinc-800 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <span className="text-xs text-zinc-400">Leave blank for the default ({DEFAULT_TWEETS_LIMIT}).</span>
      </div>

      {submitError && <p className="mt-4 max-w-2xl text-sm text-red-500">{submitError}</p>}

      {source && (
        <div className="mt-8 w-full max-w-6xl">
          <div className="mb-6 flex justify-center gap-1 rounded-full border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => handleTabChange(key)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === key
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {activeTab === "tweets" && (
            <>
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
                    onTweetClick={handleTweetClick}
                  />
                </>
              )}

              {tweetsStatus === "idle" && tweets.length === 0 && !tweetsError && (
                <p className="text-center text-sm text-zinc-400">No tweets found.</p>
              )}
            </>
          )}

          {(activeTab === "following" || activeTab === "followers") && (
            <>
              {connectionsStatus === "loading" && (
                <p className="text-center text-sm text-zinc-400">
                  Loading {activeTab}…
                </p>
              )}

              {connectionsError && <p className="text-sm text-red-500">{connectionsError}</p>}

              {connectionsStatus === "idle" &&
                (() => {
                  const list = activeTab === "following" ? following : followers;
                  if (list.length === 0) {
                    return <p className="text-center text-sm text-zinc-400">No {activeTab} found.</p>;
                  }
                  return (
                    <ConnectionsTable
                      profiles={list}
                      currentPage={connectionsPage}
                      onPageChange={setConnectionsPage}
                    />
                  );
                })()}
            </>
          )}
        </div>
      )}

      {selectedTweet && (
        <RepliersModal
          tweet={selectedTweet}
          repliers={repliersByTweet[selectedTweet.id] ?? []}
          rawCount={repliersRawCountByTweet[selectedTweet.id] ?? null}
          status={repliersStatus[selectedTweet.id] ?? "loading"}
          error={repliersError[selectedTweet.id] ?? null}
          onClose={() => setSelectedTweet(null)}
        />
      )}
    </div>
  );
}

function RepliersModal({
  tweet,
  repliers,
  rawCount,
  status,
  error,
  onClose,
}: {
  tweet: TwitterTweet;
  repliers: TweetReplier[];
  rawCount: number | null;
  status: Status;
  error: string | null;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 p-4 dark:border-zinc-800">
          <div>
            <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Replies</h2>
            <p className="mt-1 max-w-md truncate text-xs text-zinc-500 dark:text-zinc-400">{tweet.text}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto p-4">
          {status === "loading" && (
            <p className="text-center text-sm text-zinc-400">Fetching repliers…</p>
          )}

          {status === "error" && (
            <p className="text-center text-sm text-red-500">{error}</p>
          )}

          {status === "idle" && repliers.length === 0 && (
            <p className="text-center text-sm text-zinc-400">No repliers found for this tweet.</p>
          )}

          {status === "idle" && repliers.length > 0 && (
            <ul className="flex flex-col gap-3">
              {repliers.map((replier) =>
                replier.user ? (
                  (() => {
                    const user = replier.user;
                    const icp = scoreProfile(user);

                    return (
                      <li key={replier.replyId} className="flex items-start gap-3">
                        {user.profilePicture ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={user.profilePicture}
                            alt={user.userName}
                            className="h-10 w-10 shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <div className="h-10 w-10 shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <a
                              href={`https://x.com/${user.userName}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm font-medium text-zinc-800 hover:underline dark:text-zinc-100"
                            >
                              {user.name || user.userName}
                            </a>
                            <span className="text-xs text-zinc-400">@{user.userName}</span>
                            <span
                              title={icp.signals.length > 0 ? icp.signals.join(", ") : "No ICP signals matched"}
                              className="rounded-full bg-zinc-100 px-2 py-0.5 text-[0.65rem] font-medium whitespace-nowrap text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                            >
                              {icp.tag} · {icp.score}
                            </span>
                          </div>
                          {user.description && (
                            <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                              {user.description}
                            </p>
                          )}
                          <p className="mt-0.5 text-xs text-zinc-400">
                            {formatCount(user.followers)} followers
                            {icp.signals.length > 0 && ` · ${icp.signals.join(" · ")}`}
                          </p>
                        </div>
                      </li>
                    );
                  })()
                ) : (
                  <li key={replier.replyId} className="flex items-start gap-3">
                    <div className="h-10 w-10 shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-medium text-zinc-400 dark:text-zinc-500">
                        Unknown user
                      </span>
                      <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                        Profile data unavailable for this reply.
                      </p>
                      {replier.replyUrl && (
                        <a
                          href={replier.replyUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-0.5 inline-block text-xs text-blue-600 hover:underline dark:text-blue-400"
                        >
                          View reply
                        </a>
                      )}
                    </div>
                  </li>
                )
              )}
            </ul>
          )}
        </div>

        <div className="border-t border-zinc-200 px-4 py-2 text-xs text-zinc-400 dark:border-zinc-800">
          {status === "idle" && rawCount !== null
            ? (() => {
                const withProfile = repliers.filter((r) => r.user !== null).length;
                return `Apify's search index returned ${rawCount} reply result${rawCount === 1 ? "" : "s"}` +
                  (withProfile !== rawCount
                    ? `, ${withProfile} with usable profile data.`
                    : ", all with usable profile data.");
              })()
            : "Showing up to 100 most recent repliers."}
        </div>
      </div>
    </div>
  );
}

type SortField = "likeCount" | "replyCount" | "retweetCount" | "quoteCount" | "viewCount" | "createdAt";

const SORTABLE_COLUMNS: { field: SortField; label: string }[] = [
  { field: "likeCount", label: "Likes" },
  { field: "replyCount", label: "Comments" },
  { field: "retweetCount", label: "Retweets" },
  { field: "quoteCount", label: "Quotes" },
  { field: "viewCount", label: "Views" },
  { field: "createdAt", label: "Posted Date" },
];

function toNumberOrUndefined(raw: string): number | undefined {
  if (raw.trim() === "") return undefined;
  const n = Number(raw);
  return Number.isNaN(n) ? undefined : n;
}

function TweetsTable({
  tweets,
  username,
  currentPage,
  onPageChange,
  onTweetClick,
}: {
  tweets: TwitterTweet[];
  username?: string;
  currentPage: number;
  onPageChange: (page: number) => void;
  onTweetClick: (tweet: TwitterTweet) => void;
}) {
  const [minLikes, setMinLikes] = useState("");
  const [maxLikes, setMaxLikes] = useState("");
  const [minComments, setMinComments] = useState("");
  const [maxComments, setMaxComments] = useState("");
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const minLikesNum = toNumberOrUndefined(minLikes);
  const maxLikesNum = toNumberOrUndefined(maxLikes);
  const minCommentsNum = toNumberOrUndefined(minComments);
  const maxCommentsNum = toNumberOrUndefined(maxComments);

  const filteredTweets = tweets.filter((tweet) => {
    if (minLikesNum !== undefined && tweet.likeCount < minLikesNum) return false;
    if (maxLikesNum !== undefined && tweet.likeCount > maxLikesNum) return false;
    if (minCommentsNum !== undefined && tweet.replyCount < minCommentsNum) return false;
    if (maxCommentsNum !== undefined && tweet.replyCount > maxCommentsNum) return false;
    return true;
  });

  const sortedTweets = sortField
    ? [...filteredTweets].sort((a, b) => {
        const av = sortField === "createdAt" ? new Date(a.createdAt).getTime() : a[sortField];
        const bv = sortField === "createdAt" ? new Date(b.createdAt).getTime() : b[sortField];
        return sortDirection === "asc" ? av - bv : bv - av;
      })
    : filteredTweets;

  const hasActiveFilters = minLikes || maxLikes || minComments || maxComments;

  const handleFilterChange = (setter: (v: string) => void) => (e: ChangeEvent<HTMLInputElement>) => {
    setter(e.target.value);
    onPageChange(1);
  };

  const handleClearFilters = () => {
    setMinLikes("");
    setMaxLikes("");
    setMinComments("");
    setMaxComments("");
    onPageChange(1);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
    onPageChange(1);
  };

  const totalPages = Math.max(1, Math.ceil(sortedTweets.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageTweets = sortedTweets.slice(start, start + PAGE_SIZE);

  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Min likes</label>
          <input
            type="number"
            value={minLikes}
            onChange={handleFilterChange(setMinLikes)}
            placeholder="0"
            className="w-24 rounded-lg border border-zinc-200 bg-transparent px-2 py-1 text-zinc-800 outline-none dark:border-zinc-700 dark:text-zinc-100"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Max likes</label>
          <input
            type="number"
            value={maxLikes}
            onChange={handleFilterChange(setMaxLikes)}
            placeholder="∞"
            className="w-24 rounded-lg border border-zinc-200 bg-transparent px-2 py-1 text-zinc-800 outline-none dark:border-zinc-700 dark:text-zinc-100"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Min comments</label>
          <input
            type="number"
            value={minComments}
            onChange={handleFilterChange(setMinComments)}
            placeholder="0"
            className="w-24 rounded-lg border border-zinc-200 bg-transparent px-2 py-1 text-zinc-800 outline-none dark:border-zinc-700 dark:text-zinc-100"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Max comments</label>
          <input
            type="number"
            value={maxComments}
            onChange={handleFilterChange(setMaxComments)}
            placeholder="∞"
            className="w-24 rounded-lg border border-zinc-200 bg-transparent px-2 py-1 text-zinc-800 outline-none dark:border-zinc-700 dark:text-zinc-100"
          />
        </div>
        {hasActiveFilters && (
          <button
            onClick={handleClearFilters}
            className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:text-white"
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto text-xs text-zinc-400">
          {sortedTweets.length} of {tweets.length} tweets
        </span>
      </div>

      <div className="w-full overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-225 border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              <th className="px-3 py-2 font-medium">Username</th>
              <th className="px-3 py-2 font-medium">Tweet Link</th>
              <th className="px-3 py-2 font-medium">Tweet Text</th>
              {SORTABLE_COLUMNS.map(({ field, label }) => (
                <th key={field} className="px-3 py-2 font-medium">
                  <button
                    onClick={() => handleSort(field)}
                    className="flex items-center gap-1 uppercase tracking-wide text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                  >
                    {label}
                    <span className="text-[0.6rem] leading-none">
                      {sortField === field ? (sortDirection === "asc" ? "▲" : "▼") : "⇅"}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageTweets.map((tweet) => (
              <tr
                key={tweet.id}
                onClick={() => onTweetClick(tweet)}
                className="cursor-pointer border-b border-zinc-100 bg-white last:border-0 hover:bg-zinc-50 dark:border-zinc-900 dark:bg-zinc-950 dark:hover:bg-zinc-900"
              >
                <td className="px-3 py-2 whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                  {username ? `@${username}` : "—"}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <a
                    href={tweet.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
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

      {sortedTweets.length === 0 && (
        <p className="mt-4 text-center text-sm text-zinc-400">No tweets match the current filters.</p>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
          <span>
            Page {safePage} of {totalPages} ({sortedTweets.length} tweets)
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

type ConnectionSortField = "icpScore" | "followers" | "following";

const CONNECTION_SORTABLE_COLUMNS: { field: ConnectionSortField; label: string }[] = [
  { field: "icpScore", label: "ICP Score" },
  { field: "followers", label: "Followers" },
  { field: "following", label: "Following" },
];

function ConnectionsTable({
  profiles,
  currentPage,
  onPageChange,
}: {
  profiles: TwitterConnection[];
  currentPage: number;
  onPageChange: (page: number) => void;
}) {
  const [minIcpScore, setMinIcpScore] = useState("");
  const [sortField, setSortField] = useState<ConnectionSortField | null>("icpScore");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  // Scored once per render off the raw list — these lists are small (tens of
  // profiles per relation), so no memoization is needed.
  const scored = profiles.map((profile) => ({ profile, icp: scoreProfile(profile) }));

  const minIcpScoreNum = toNumberOrUndefined(minIcpScore);
  const filtered = scored.filter(({ icp }) => minIcpScoreNum === undefined || icp.score >= minIcpScoreNum);

  const sorted = sortField
    ? [...filtered].sort((a, b) => {
        const av = sortField === "icpScore" ? a.icp.score : a.profile[sortField];
        const bv = sortField === "icpScore" ? b.icp.score : b.profile[sortField];
        return sortDirection === "asc" ? av - bv : bv - av;
      })
    : filtered;

  const handleSort = (field: ConnectionSortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
    onPageChange(1);
  };

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const pageItems = sorted.slice(start, start + PAGE_SIZE);

  return (
    <div className="w-full">
      <div className="mb-3 flex flex-wrap items-end gap-3 rounded-xl border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Min ICP score</label>
          <input
            type="number"
            value={minIcpScore}
            onChange={(e) => {
              setMinIcpScore(e.target.value);
              onPageChange(1);
            }}
            placeholder="0"
            className="w-24 rounded-lg border border-zinc-200 bg-transparent px-2 py-1 text-zinc-800 outline-none dark:border-zinc-700 dark:text-zinc-100"
          />
        </div>
        {minIcpScore && (
          <button
            onClick={() => {
              setMinIcpScore("");
              onPageChange(1);
            }}
            className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:text-white"
          >
            Clear filter
          </button>
        )}
        <span className="ml-auto text-xs text-zinc-400">
          {sorted.length} of {profiles.length} profiles
        </span>
      </div>

      <div className="w-full overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-225 border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-100 text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              <th className="px-3 py-2 font-medium">Profile</th>
              <th className="px-3 py-2 font-medium">Bio</th>
              {CONNECTION_SORTABLE_COLUMNS.map(({ field, label }) => (
                <th key={field} className="px-3 py-2 font-medium">
                  <button
                    onClick={() => handleSort(field)}
                    className="flex items-center gap-1 uppercase tracking-wide text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
                  >
                    {label}
                    <span className="text-[0.6rem] leading-none">
                      {sortField === field ? (sortDirection === "asc" ? "▲" : "▼") : "⇅"}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageItems.map(({ profile, icp }) => (
              <tr
                key={profile.userName}
                className="border-b border-zinc-100 bg-white last:border-0 hover:bg-zinc-50 dark:border-zinc-900 dark:bg-zinc-950 dark:hover:bg-zinc-900"
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {profile.profilePicture ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={profile.profilePicture}
                        alt={profile.userName}
                        className="h-8 w-8 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div className="h-8 w-8 shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                    )}
                    <div className="min-w-0">
                      <a
                        href={`https://x.com/${profile.userName}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block truncate text-sm font-medium text-zinc-800 hover:underline dark:text-zinc-100"
                      >
                        {profile.name || profile.userName}
                      </a>
                      <span className="text-xs text-zinc-400">@{profile.userName}</span>
                    </div>
                  </div>
                </td>
                <td className="max-w-xs min-w-48 px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <span className="line-clamp-2">{profile.description || "—"}</span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span
                    title={icp.signals.length > 0 ? icp.signals.join(", ") : "No ICP signals matched"}
                    className="rounded-full bg-zinc-100 px-2 py-0.5 text-[0.65rem] font-medium whitespace-nowrap text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                  >
                    {icp.tag} · {icp.score}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-zinc-600 dark:text-zinc-300">
                  {formatCount(profile.followers)}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-zinc-600 dark:text-zinc-300">
                  {formatCount(profile.following)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sorted.length === 0 && (
        <p className="mt-4 text-center text-sm text-zinc-400">No profiles match the current filters.</p>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-zinc-500 dark:text-zinc-400">
          <span>
            Page {safePage} of {totalPages} ({sorted.length} profiles)
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
