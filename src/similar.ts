/**
 * The item matcher. It answers one question: does a hand-typed line
 * look like something already in the catalogue? Before an invoice is issued, every custom line is
 * scored against every catalogue name, and anything at or over THRESHOLD is flagged in case the
 * pick from the search list was missed.
 *
 * `score(a, b)` is 1 for the same name once normalised, high for a typo of it, and high for two or
 * more words that all appear in the other name. A one-word name only matches a near-identical one.
 */

export const THRESHOLD = 0.8;

const MARKS = /[̀-ͯ]/g;

export function normalize(s: string) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(MARKS, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function distance(a: string, b: string) {
  let prev: number[] = [];
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function ratio(a: string, b: string) {
  const longest = Math.max(a.length, b.length);
  return longest ? 1 - distance(a, b) / longest : 1;
}

function tokenIn(token: string, tokens: string[]) {
  return tokens.some((t) => t === token || (token.length >= 4 && t.length >= 4 && ratio(token, t) >= 0.8));
}

const digits = (s: string) => (s.match(/\d+/g) || []).join(" ");

export function score(a: string, b: string) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  // Same words, different numbers: a size or a variant, not a duplicate ("Balancing (2 wheels)"
  // against "Balancing (4 wheels)"). On a short name one character is a large share of it, so the
  // edit distance alone would call these near-identical.
  if (na.replace(/\d+/g, "") === nb.replace(/\d+/g, "") && digits(na) !== digits(nb)) return 0;

  let s = ratio(na, nb);
  const ta = na.split(" ");
  const tb = nb.split(" ");
  const small = ta.length <= tb.length ? ta : tb;
  const large = small === ta ? tb : ta;
  if (small.length >= 2 && small.every((t) => tokenIn(t, large))) s = Math.max(s, 0.9);
  return s;
}

/** Case- and accent-insensitive, punctuation kept: what a SQL LIKE sees. */
const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(MARKS, "");

/**
 * The search box: every typed word has to appear somewhere in the item's text (reference, both
 * names, both descriptions), in any order. Capped at 25 results.
 */
export function search<T>(query: string, items: T[], hay: (item: T) => string) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return items.filter((p) => {
    const h = fold(hay(p));
    return words.every((w) => h.includes(w));
  }).slice(0, 25);
}
