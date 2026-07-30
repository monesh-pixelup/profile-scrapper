import ExcelJS from "exceljs";
import type { TwitterTweet } from "@/lib/twitter/types";

const COLUMNS: { header: string; key: keyof TwitterTweet; width: number }[] = [
  { header: "Post URL", key: "url", width: 45 },
  { header: "Tweet Text", key: "text", width: 60 },
  { header: "Post Date", key: "createdAt", width: 22 },
  { header: "Likes", key: "likeCount", width: 12 },
  { header: "Retweets", key: "retweetCount", width: 12 },
  { header: "Quote Tweets", key: "quoteCount", width: 14 },
  { header: "Reply Count", key: "replyCount", width: 14 },
  { header: "View Count", key: "viewCount", width: 14 },
];

// Builds an .xlsx workbook from already-fetched tweets and returns it as a
// Blob ready for download. Purely client-side — no network calls.
export async function buildTweetsWorkbookBlob(
  tweets: TwitterTweet[],
  profileHandle: string
): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Latest Tweets");

  sheet.columns = [
    { header: "Profile Handle", key: "profileHandle", width: 20 },
    ...COLUMNS,
  ];
  sheet.getRow(1).font = { bold: true };

  for (const tweet of tweets) {
    sheet.addRow({
      profileHandle: `@${profileHandle}`,
      url: tweet.url,
      text: tweet.text,
      createdAt: tweet.createdAt,
      likeCount: tweet.likeCount,
      retweetCount: tweet.retweetCount,
      quoteCount: tweet.quoteCount,
      replyCount: tweet.replyCount,
      viewCount: tweet.viewCount,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
