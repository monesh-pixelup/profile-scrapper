import type { TwitterUser } from "@/lib/twitter/types";

export interface IcpResult {
  score: number;
  tag: string;
  signals: string[];
}

interface SignalMatch {
  points: number;
  signal: string | null;
}

// Category max-point budget, out of ~100. Two adjustments from the
// original 5-category spec (30/20/25/15/10):
//
// 1. "Momentum/recency" (funding date) is dropped entirely — a Twitter
//    profile has no such field, so it could only ever score 0.
// 2. Funding amount is deliberately minimized rather than kept at its
//    rescaled share: there's no reliable way to know a company's funding
//    from a 160-character bio (most people never mention it, and when
//    they do it's unverifiable), so it's dropped to a token weight instead
//    of being treated as equally trustworthy as the other categories.
//
// The points freed by both of those are redistributed, proportional to
// their prior weights, across Location/AI focus/Enterprise — the three
// categories that run off data every profile actually has (bio text,
// name/handle, location field) and are far more consistently inferable
// than an incidental funding mention:
//   Funding    30 -> 10  (bio text mention — kept low on purpose)
//   Location   20 -> 33  (location field + bio text)
//   AI focus   25 -> 40  (bio text + name/handle)
//   Enterprise 10 -> 17  (bio text, additive)
//
// Note: an earlier version gated Location behind funding/AI/enterprise
// already matching, so a bio with no ICP buzzwords scored 0 regardless of
// location. That over-corrected — most real bios (including real
// founders') never literally say "AI"/"B2B"/"enterprise"/"Series A", so
// almost nothing cleared the gate and every profile came back as 0.
// Location is scored unconditionally again.
const FUNDING_MAX = 10;
const LOCATION_MAX = 33;
const AI_MAX = 40;
const ENTERPRISE_MAX = 17;

// Single-letter suffixes (M/B/K) are only trusted right after a "$" — bare
// "10k" elsewhere in a bio is far more likely to mean "10k followers" than
// a funding amount. Spelled-out "million/billion/thousand" is trusted
// without a "$" since it's unambiguous either way.
export function parseFundingAmount(text: string): number | null {
  const dollarMatch = text.match(/\$\s?(\d+(?:\.\d+)?)\s*(billion|million|thousand|[bmk])?\b/i);
  if (dollarMatch) {
    const value = parseFloat(dollarMatch[1]);
    const unit = dollarMatch[2]?.toLowerCase();
    const multiplier =
      unit === "billion" || unit === "b"
        ? 1_000_000_000
        : unit === "million" || unit === "m"
          ? 1_000_000
          : unit === "thousand" || unit === "k"
            ? 1_000
            : 1;
    return value * multiplier;
  }

  const wordMatch = text.match(/(\d+(?:\.\d+)?)\s*(billion|million|thousand)\b/i);
  if (wordMatch) {
    const value = parseFloat(wordMatch[1]);
    const unit = wordMatch[2].toLowerCase();
    const multiplier = unit === "billion" ? 1_000_000_000 : unit === "million" ? 1_000_000 : 1_000;
    return value * multiplier;
  }

  return null;
}

// Twitter bios occasionally mention funding directly ("raised $10M Series A",
// "backed by YC W24"); this is the closest substitute for the spec's
// structured funding_amount/funding_stage fields, but it's an unreliable
// signal (most bios never mention it, and it's unverifiable when they do)
// so the tiers are scaled down to the token FUNDING_MAX=10 budget rather
// than treated as a trustworthy category.
function scoreFunding(bio: string): SignalMatch {
  const amount = parseFundingAmount(bio);
  if (amount !== null) {
    if (amount >= 75_000_000) return { points: 8, signal: "$75M+ (Scale-up)" };
    if (amount >= 40_000_000) return { points: FUNDING_MAX, signal: "$40M+ (Series B+ sweet spot)" };
    if (amount >= 20_000_000) return { points: 9, signal: "$20M+ (Series A/B)" };
    if (amount >= 10_000_000) return { points: 7, signal: "$10M+ (Series A)" };
    if (amount >= 5_000_000) return { points: 5, signal: "$5M+ (Seed+)" };
    return { points: 2, signal: "<$5M (Early)" };
  }

  if (/series\s*b|series\s*c/i.test(bio)) return { points: 8, signal: "Series B/C mention" };
  if (/series\s*a/i.test(bio)) return { points: 7, signal: "Series A mention" };

  if (/\byc\b|y\s?combinator/i.test(bio)) {
    const batchMatch = bio.match(/\b([ws])\s?(2[3-5])\b/i);
    if (batchMatch) {
      const batch = `${batchMatch[1].toUpperCase()}${batchMatch[2]}`;
      if (["W24", "S24", "W25", "S25"].includes(batch)) return { points: 6, signal: `YC ${batch}` };
      if (["W23", "S23"].includes(batch)) return { points: 4, signal: `YC ${batch}` };
    }
    return { points: 3, signal: "YC Alumni" };
  }

  return { points: 0, signal: null };
}

// Checked in priority order — first match wins, per spec. Tier values
// scaled to the new LOCATION_MAX=33 (was 20).
function scoreLocation(text: string): SignalMatch {
  if (/\b(sf|bay area|silicon valley|palo alto|san francisco)\b/i.test(text)) {
    return { points: LOCATION_MAX, signal: "SF/Bay Area" };
  }
  if (/\b(new york|nyc|manhattan|brooklyn)\b/i.test(text)) return { points: LOCATION_MAX, signal: "New York/NYC" };
  if (/\b(london|united kingdom|uk)\b/i.test(text)) return { points: 25, signal: "London/UK" };
  if (/\b(berlin|germany)\b/i.test(text)) return { points: 25, signal: "Berlin/Germany" };
  if (/\b(tel aviv|israel)\b/i.test(text)) return { points: 23, signal: "Tel Aviv/Israel" };
  if (/\b(paris|france)\b/i.test(text)) return { points: 19, signal: "Paris/France" };
  if (/\b(amsterdam|netherlands)\b/i.test(text)) return { points: 19, signal: "Amsterdam/Netherlands" };
  if (/\b(boston|seattle|austin|los angeles|la)\b/i.test(text)) {
    return { points: 17, signal: "Boston/Seattle/Austin/LA" };
  }
  if (text.trim() && !/remote/i.test(text)) return { points: 8, signal: "Other location" };
  return { points: 0, signal: null };
}

// `bodyText` stands in for the spec's industry_tags; `nameText` stands in
// for company_name (Twitter profiles have neither field, only a bio and a
// display name/handle). Tier values scaled to the new AI_MAX=40 (was 25).
function scoreAiFocus(bodyText: string, nameText: string): SignalMatch {
  if (/generative ai|large language model|\bllm\b|\bgpt\b/i.test(bodyText)) {
    return { points: AI_MAX, signal: "Generative AI/LLM" };
  }
  if (/\.ai\b|\bai\b|\bgpt\b/i.test(nameText)) return { points: 36, signal: "AI in name/handle" };
  if (/artificial intelligence|machine learning|deep learning/i.test(bodyText)) {
    return { points: 32, signal: "AI/ML" };
  }
  if (/computer vision|\bnlp\b|natural language/i.test(bodyText)) {
    return { points: 29, signal: "Computer vision/NLP" };
  }
  if (/\b(b2b|saas|enterprise)\b/i.test(bodyText) && /\bai\b/i.test(bodyText)) {
    return { points: 36, signal: "B2B/SaaS + AI" };
  }
  if (/\bai\b/i.test(bodyText)) return { points: 23, signal: "AI mention" };
  return { points: 0, signal: null };
}

// Additive, capped at ENTERPRISE_MAX=17 (was 10). Sub-signal values scaled
// proportionally (8/5/7 -> 14/9/11).
function scoreEnterpriseSignals(text: string): { points: number; signals: string[] } {
  let points = 0;
  const signals: string[] = [];

  if (/\b(enterprise|b2b|sales)\b/i.test(text)) {
    points += 14;
    signals.push("Enterprise/B2B/Sales");
  }
  if (/\b(api|developer tools|infrastructure)\b/i.test(text)) {
    points += 9;
    signals.push("API/Developer tools");
  }
  if (/\b(healthcare|fintech|legal|security)\b/i.test(text)) {
    points += 11;
    signals.push("Healthcare/Fintech/Legal/Security");
  }

  return { points: Math.min(points, ENTERPRISE_MAX), signals };
}

function tagForScore(score: number): string {
  if (score >= 80) return "🔥 PERFECT FIT";
  if (score >= 65) return "⭐ STRONG FIT";
  if (score >= 50) return "✅ GOOD FIT";
  if (score >= 35) return "📊 POTENTIAL";
  if (score >= 20) return "🔍 REVIEW";
  return "❄️ LOW FIT";
}

// Adapts the ICP lead-scoring spec to a Twitter profile, which has no
// structured funding_amount/funding_stage/funding_date/industry_tags/
// company_name fields — only a bio, display name, handle, and (sometimes)
// a location string. Every signal below is inferred from that free text;
// see the category-max comments above for how the point budget was
// rebalanced after dropping the always-zero momentum/recency category.
export function scoreProfile(user: TwitterUser): IcpResult {
  const bio = user.description ?? "";
  const location = user.location ?? "";
  const nameText = `${user.name ?? ""} ${user.userName ?? ""}`;
  const bodyText = `${bio} ${location}`;

  const signals: string[] = [];
  let score = 0;

  const funding = scoreFunding(bio);
  score += funding.points;
  if (funding.signal) signals.push(funding.signal);

  const loc = scoreLocation(`${location} ${bio}`);
  score += loc.points;
  if (loc.signal) signals.push(loc.signal);

  const ai = scoreAiFocus(bodyText, nameText);
  score += ai.points;
  if (ai.signal) signals.push(ai.signal);

  const enterprise = scoreEnterpriseSignals(bodyText);
  score += enterprise.points;
  signals.push(...enterprise.signals);

  return { score, tag: tagForScore(score), signals };
}
