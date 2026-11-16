/**
 * Number and date formatting for printed documents, and French amounts in words.
 *
 * The words are spelled with the same rules, case by case, as the PHP helper the printed facture
 * uses: "vingt et un" but "quatre-vingt-un"; "quatre-vingts" and "deux cents" take an s only at
 * the end of a number and never before "mille"; "mille" takes no "un" and never an s. The scope
 * is invoice amounts, 0 to 999 999 999.99.
 */

const UNITS = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
  "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize",
  "dix-sept", "dix-huit", "dix-neuf",
];

const TENS: Record<number, string> = {
  2: "vingt", 3: "trente", 4: "quarante", 5: "cinquante", 6: "soixante", 7: "soixante", 8: "quatre-vingt", 9: "quatre-vingt",
};

function under100(n: number, beforeMille = false): string {
  if (n < 20) return UNITS[n];
  const t = Math.floor(n / 10);
  const u = n % 10;
  // 70-79 and 90-99 count on from soixante / quatre-vingt using the teens.
  if (t === 7 || t === 9) {
    const rest = UNITS[10 + u];
    return t === 7 && u === 1 ? `${TENS[t]} et ${rest}` : `${TENS[t]}-${rest}`;
  }
  if (u === 0) return t === 8 && !beforeMille ? `${TENS[t]}s` : TENS[t];
  // "quatre-vingt-un" takes no "et", unlike "vingt et un".
  if (u === 1 && t !== 8) return `${TENS[t]} et un`;
  return `${TENS[t]}-${UNITS[u]}`;
}

function under1000(n: number, beforeMille = false): string {
  if (n < 100) return under100(n, beforeMille);
  const h = Math.floor(n / 100);
  const r = n % 100;
  const s = h === 1 ? "cent" : `${under100(h)} cent`;
  if (r === 0) return h > 1 && !beforeMille ? `${s}s` : s;
  return `${s} ${under100(r, beforeMille)}`;
}

export function integerToFrenchWords(n: number): string {
  if (n === 0) return "zéro";
  const parts: string[] = [];
  for (const [value, one, many] of [
    [1_000_000_000, "milliard", "milliards"],
    [1_000_000, "million", "millions"],
  ] as const) {
    if (n >= value) {
      const count = Math.floor(n / value);
      n %= value;
      parts.push(`${under1000(count)} ${count > 1 ? many : one}`);
    }
  }
  if (n >= 1000) {
    const count = Math.floor(n / 1000);
    n %= 1000;
    // "mille" is invariable and takes no "un" before it.
    parts.push(count === 1 ? "mille" : `${under1000(count, true)} mille`);
  }
  if (n > 0) parts.push(under1000(n));
  return parts.join(" ");
}

/** "Deux mille trois cent soixante-six dirhams et quatre-vingt-six centimes". */
export function amountToFrenchWords(amount: number): string {
  const a = Math.round(amount * 100) / 100;
  const dirhams = Math.floor(a);
  const centimes = Math.round((a - dirhams) * 100);
  let words = `${integerToFrenchWords(dirhams)} ${dirhams === 1 ? "dirham" : "dirhams"}`;
  if (centimes > 0) words += ` et ${integerToFrenchWords(centimes)} ${centimes === 1 ? "centime" : "centimes"}`;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** PHP's number_format with "," thousands and "." decimals: 1,234.56 */
export function numberFormat(n: number, decimals = 2): string {
  const neg = n < 0;
  const [int, dec] = Math.abs(n).toFixed(decimals).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${grouped}${dec ? `.${dec}` : ""}`;
}

/** The printed documents' amount: no currency, and a zero prints nothing at all (as the real helper does). */
export const formatAmount = (n: number | null | undefined) => (n ? numberFormat(n) : "");
/** Quantities: two decimals, the configured item precision. */
export const formatQuantity = (n: number | null | undefined) => (n ? numberFormat(n) : "");
/** Amount with the currency after a non-breaking space: 1,234.56 DH */
export const formatCurrency = (n: number) => `${numberFormat(n)} DH`;

/** A stored Y-m-d date in the date-format setting. */
export function formatDate(iso: string, fmt: "dmy" | "ymd") {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return fmt === "ymd" ? `${y}-${m}-${d}` : `${d}/${m}/${y}`;
}

/** Percentages print with a decimal comma and no trailing zeros: 20 → "20", 7.5 → "7,5". */
export const frPercent = (p: number) => String(Number(p)).replace(".", ",");
