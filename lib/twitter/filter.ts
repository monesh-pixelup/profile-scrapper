import type { TwitterUser } from "./types";

// Matched against a normalized (lowercased, punctuation-loosened) version of
// a profile's name + bio. Patterns use flexible whitespace/separators so
// variants like "UI & UX", "UI/UX", "UI, UX", and "UIUX" all match.
const DESIGN_PATTERNS: RegExp[] = [
  // UI/UX in any order or separator (slash, ampersand, comma, dash, or none)
  /\bui\s*[/&,|+-]*\s*ux\b/i,
  /\bux\s*[/&,|+-]*\s*ui\b/i,

  // Roles and titles
  /\bdesign\s*eng(ineer(ing)?)?\b/i,
  /\bbrand\s*eng(ineer(ing)?)?\b/i,
  /\bproduct\s+design(er)?\b/i,
  /\bweb\s+design(er)?\b/i,
  /\bux\s+design(er)?\b/i,
  /\bui\s+design(er)?\b/i,
  /\bgraphic\s+design(er)?\b/i,
  /\bvisual\s+design(er)?\b/i,
  /\bbrand\s+design(er)?\b/i,
  /\bchief\s+design\s+officer\b/i,
  /\bhead\s+of\s+design\b/i,
  /\bcreative\s+director\b/i,
  /\bart\s+director\b/i,
  /\bcreative\s+partner\b/i,

  // Companies/orgs
  /\bdesign\s+agency\b/i,
  /\bcreative\s+studio\b/i,
  /\bdesign\s+studio\b/i,

  // Generic catch-all: "designer" on its own (e.g. bare "Designer" title)
  /\bdesigner\b/i,
];

// Split a "#ProductDesigner"-style hashtag/camelCase word into separate
// words so the patterns above (which expect whitespace) still match it.
function splitCamelCase(text: string): string {
  return text.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function normalize(text: string): string {
  return splitCamelCase(text).replace(/[#@]/g, " ").toLowerCase();
}

export function isDesignRelated(user: TwitterUser): boolean {
  const haystack = normalize(`${user.name} ${user.description}`);
  return DESIGN_PATTERNS.some((pattern) => pattern.test(haystack));
}

export function filterDesignProfiles(users: TwitterUser[]): TwitterUser[] {
  const seen = new Set<string>();
  return users.filter((user) => {
    if (seen.has(user.userName)) return false;
    seen.add(user.userName);
    return isDesignRelated(user);
  });
}
