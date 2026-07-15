// Clean, UI-facing shape used throughout the app, regardless of which
// scraping backend produced it.
export interface TwitterUser {
  userName: string;
  name: string;
  description: string;
  profilePicture: string;
  followers: number;
  following: number;
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
