// Shape of a single profile row from xquik/x-follower-scraper in "compact"
// output mode. Diagnostic/unavailable rows lack `username`, so that field
// is what we use to filter them out.
export interface RawApifyFollowerRow {
  resultType?: string;
  username?: string;
  name?: string;
  description?: string;
  profilePicture?: string;
  followers?: number;
  following?: number;
  sourceRelation?: "followers" | "following";
}

// Shape of the author embedded in each tweet returned by
// kaitoeasyapi/twitter-x-data-tweet-scraper (used for quote/reply search).
export interface RawApifyTweetAuthor {
  userName: string;
  name: string;
  description: string;
  profilePicture: string;
  followers: number;
  following: number;
  // Not present on every account (many leave it blank), so always optional.
  location?: string;
}

export interface RawApifyTweet {
  // "tweet" for real results. When a search returns fewer than ~15 results
  // (including none), the actor still bills a minimum and pads the dataset
  // with placeholder rows of type "mock_tweet" (id -1, no author).
  type?: string;
  id: string;
  url: string;
  text: string;
  createdAt: string;
  retweetCount?: number;
  replyCount?: number;
  likeCount?: number;
  quoteCount?: number;
  viewCount?: number;
  isReply?: boolean;
  // Present (non-null) when the row is a native retweet.
  retweeted_tweet?: unknown;
  author?: RawApifyTweetAuthor;
}
