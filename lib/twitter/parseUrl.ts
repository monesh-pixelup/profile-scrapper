export type TwitterUrlTarget =
  | { type: "profile"; username: string }
  | { type: "tweet"; tweetId: string };

const TWITTER_HOSTS = new Set([
  "twitter.com",
  "www.twitter.com",
  "mobile.twitter.com",
  "x.com",
  "www.x.com",
  "mobile.x.com",
]);

// Path segments that are Twitter/X routes, not usernames.
const RESERVED_PATHS = new Set([
  "i",
  "home",
  "explore",
  "notifications",
  "messages",
  "settings",
  "search",
  "compose",
  "intent",
  "hashtag",
  "share",
  "login",
  "logout",
  "signup",
]);

const USERNAME_PATTERN = /^[A-Za-z0-9_]{1,15}$/;
const TWEET_ID_PATTERN = /^\d+$/;

/**
 * Accepts a profile URL, a post/tweet URL (e.g. .../username/status/123 or
 * .../i/web/status/123), a bare "@handle", or a bare handle, and returns
 * what it points to, or null if nothing valid could be found.
 */
export function parseTwitterUrl(input: string): TwitterUrlTarget | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const looksLikeUrl = /^https?:\/\//i.test(trimmed) || /\./.test(trimmed);
  if (!looksLikeUrl) {
    const username = sanitizeUsername(trimmed);
    return username ? { type: "profile", username } : null;
  }

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    return null;
  }

  if (!TWITTER_HOSTS.has(url.hostname.toLowerCase())) {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);

  const statusIndex = segments.findIndex((segment) => segment === "status" || segment === "statuses");
  if (statusIndex !== -1) {
    const tweetId = segments[statusIndex + 1];
    return tweetId && TWEET_ID_PATTERN.test(tweetId) ? { type: "tweet", tweetId } : null;
  }

  const [firstSegment] = segments;
  if (!firstSegment || RESERVED_PATHS.has(firstSegment.toLowerCase())) {
    return null;
  }

  const username = sanitizeUsername(firstSegment);
  return username ? { type: "profile", username } : null;
}

function sanitizeUsername(value: string): string | null {
  const username = value.replace(/^@/, "").trim();
  return USERNAME_PATTERN.test(username) ? username : null;
}
