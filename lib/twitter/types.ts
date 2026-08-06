// Clean, UI-facing shape used throughout the app, regardless of which
// scraping backend produced it.
export interface TwitterUser {
  userName: string;
  name: string;
  description: string;
  profilePicture: string;
  followers: number;
  following: number;
  // Rarely populated by the scraper — used as an ICP location signal when present.
  location?: string;
}

export interface TwitterTweet {
  id: string;
  url: string;
  text: string;
  createdAt: string;
  retweetCount: number;
  replyCount: number;
  likeCount: number;
  quoteCount: number;
  viewCount: number;
}

// One reply to a tweet. `user` is null when the scraper returned the reply
// itself but with no usable author data (a malformed stub row) — the reply
// is still kept and shown, just without profile details to display.
export interface TweetReplier {
  replyId: string;
  replyUrl: string;
  replyText: string;
  user: TwitterUser | null;
}

// A follower/following entry for a profile — same shape as TwitterUser plus
// which side of the relationship it came from.
export interface TwitterConnection extends TwitterUser {
  relation: "followers" | "following";
}
