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
}

export interface RawApifyTweet {
  id: string;
  url: string;
  text: string;
  createdAt: string;
  retweetCount?: number;
  replyCount?: number;
  likeCount?: number;
  quoteCount?: number;
  viewCount?: number;
  author?: RawApifyTweetAuthor;
}
