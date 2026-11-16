/**
 * Invoice arithmetic.
 *
 *   1. each line net of its own per-unit discount; their sum is the Subtotal;
 *   2. the whole-invoice discount shared over those nets: a percentage per line, or a fixed amount
 *      in proportion, with the LAST line taking the rounding remainder so exactly the amount
 *      entered comes off;
 *   3. VAT per line on what is left, rounded to cents, summed per rate;
 *   4. Total, then Balance (Total minus payments).
 *
 * Status after Draft is derived from payments, never chosen: nothing paid is Unpaid, nothing left
 * to collect is Paid, anything between is Partially paid.
 */

export type DiscountUnit = "percent" | "amount";
export type PayMethod = "cash" | "cheque" | "transfer";

export type Line = {
  key: string;
  /** Linked catalogue item (service or part), or null for a custom (typed) line. */
  productId: string | null;
  /** As typed, for a custom line; the catalogue name decides what a linked line shows. */
  name: string;
  qty: string;
  price: string;
  /** Per-unit discount amount. */
  discount: string;
  taxId: string;
  /** Frozen at sale time, like the cost. */
  taxPercent: number;
  /** Unit cost frozen at the moment of sale; null when no cost was recorded. */
  cost: number | null;
};

export type Payment = { id: string; date: string; amount: number; method: PayMethod };

export type Invoice = {
  id: string;
  /** Null while a draft: a draft takes a number only when it is issued. */
  number: string | null;
  clientId: string;
  date: string;
  due: string;
  issued: boolean;
  /** The one invoice custom field, "Véhicule / Immatriculation", free text. */
  vehicle: string;
  /** Whether the facture's legal block prints the CNSS number / the RIB. Off for a new invoice. */
  includeCnss: boolean;
  includeRib: boolean;
  /** Set on a credit note (avoir): the invoice it credits. */
  creditParentId: string | null;
  /** Locked regardless of status: an invoice that has been credited. */
  locked: boolean;
  discount: { unit: DiscountUnit; value: string };
  lines: Line[];
  payments: Payment[];
  /** Creation order, the tiebreaker for invoices of the same date. */
  seq: number;
};

export type Status = "draft" | "unpaid" | "partial" | "paid";

export type LineResult = {
  key: string;
  line: Line;
  qty: number;
  gross: number;
  /** qty × (price − discount): the line total the editor shows. */
  lineTotal: number;
  /** This line's share of the whole-invoice discount. */
  share: number;
  absorbsRemainder: boolean;
  tax: number;
  /** Revenue excl. tax after every discount. */
  revenue: number;
};

export type Computed = {
  lines: LineResult[];
  subtotal: number;
  given: number;
  net: number;
  vat: { taxId: string; percent: number; amount: number }[];
  vatTotal: number;
  total: number;
  paid: number;
  balance: number;
  status: Status;
  overdue: boolean;
  daysOverdue: number;
};

/** Round to cents; the nudge keeps 1.005 from rounding down through float error. */
export const r2 = (n: number) => Math.round((n + (n >= 0 ? 1 : -1) * 1e-9) * 100) / 100;

export function parse(v: string | number): number {
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function daysBetween(fromIso: string, toIso: string) {
  const a = new Date(`${fromIso}T00:00:00`).getTime();
  const b = new Date(`${toIso}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** A line without a name is never saved, so it takes no part in anything. */
export const realLines = (inv: Invoice) => inv.lines.filter((l) => l.name.trim() !== "");

export function computeInvoice(inv: Invoice, today: string): Computed {
  const rows = realLines(inv).map((l) => {
    const qty = parse(l.qty);
    const price = parse(l.price);
    const disc = parse(l.discount);
    return {
      line: l,
      qty,
      gross: r2(qty * price),
      net: r2(qty * price) - r2(qty * disc),
      exact: qty * (price - disc),
      rate: l.taxPercent,
    };
  });

  let subtotal = 0;
  let base = 0;
  for (const r of rows) {
    subtotal += r.net;
    base += r.exact;
  }
  subtotal = r2(subtotal);

  const unit = inv.discount.unit;
  let value = Math.max(0, parse(inv.discount.value));
  value = unit === "percent" ? Math.min(value, 100) : Math.min(value, Math.max(0, base));

  let given = 0;
  const vat = new Map<string, { taxId: string; percent: number; amount: number }>();
  const lines: LineResult[] = rows.map((r, i) => {
    let share = 0;
    const last = i === rows.length - 1;
    if (unit === "percent" && value) share = r2((r.exact * value) / 100);
    else if (unit === "amount" && value && base) share = last ? r2(value - given) : r2((value * r.exact) / base);
    given = r2(given + share);
    const tax = r2(((r.exact - share) * r.rate) / 100);
    if (r.rate > 0) {
      const k = `${r.line.taxId}|${r.rate}`;
      const row = vat.get(k) ?? { taxId: r.line.taxId, percent: r.rate, amount: 0 };
      row.amount = r2(row.amount + tax);
      vat.set(k, row);
    }
    return {
      key: r.line.key,
      line: r.line,
      qty: r.qty,
      gross: r.gross,
      lineTotal: r2(r.exact),
      share,
      absorbsRemainder: unit === "amount" && !!value && !!base && last && rows.length > 1,
      tax,
      revenue: r2(r.exact - share),
    };
  });

  const net = r2(subtotal - given);
  let vatTotal = 0;
  for (const v of vat.values()) vatTotal = r2(vatTotal + v.amount);
  const total = r2(net + vatTotal);
  const paid = r2(inv.payments.reduce((s, p) => s + p.amount, 0));
  const balance = r2(total - paid);

  let status: Status;
  if (!inv.issued) status = "draft";
  else if (paid === 0 || total === 0) status = "unpaid";
  else if (total >= 0 ? balance <= 0 : balance >= 0) status = "paid";
  else status = "partial";

  const late = daysBetween(inv.due, today);
  const overdue = (status === "unpaid" || status === "partial") && balance > 0 && late > 0;

  return {
    lines,
    subtotal,
    given,
    net,
    vat: [...vat.values()].sort((a, b) => b.percent - a.percent),
    vatTotal,
    total,
    paid,
    balance,
    status,
    overdue,
    daysOverdue: overdue ? late : 0,
  };
}

/** Money owed back to the client: an overpaid invoice. Null when there is none. */
export function creditDue(c: Computed) {
  if (c.balance === 0) return null;
  return (c.total >= 0 ? c.balance < 0 : c.balance > 0) ? Math.abs(c.balance) : null;
}

export const isOpen = (c: Computed) => c.status === "unpaid" || c.status === "partial";

export function money(n: number) {
  const [int, dec] = Math.abs(n).toFixed(2).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${n < 0 ? "−" : ""}${grouped}.${dec} DH`;
}

export function isoDate(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

export type Range = { from: string; to: string };
export type Preset = "today" | "week" | "month" | "year" | "custom";

/** Week starts Monday. Built from local date parts, so no timezone shifts the day. */
export function presetRange(key: Exclude<Preset, "custom">, todayIso: string): Range {
  const now = new Date(`${todayIso}T00:00:00`);
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  if (key === "today") return { from: todayIso, to: todayIso };
  if (key === "week") {
    const offset = (now.getDay() + 6) % 7;
    return { from: isoDate(new Date(y, m, d - offset)), to: isoDate(new Date(y, m, d - offset + 6)) };
  }
  if (key === "year") return { from: isoDate(new Date(y, 0, 1)), to: isoDate(new Date(y, 11, 31)) };
  return { from: isoDate(new Date(y, m, 1)), to: isoDate(new Date(y, m + 1, 0)) };
}

export const inRange = (iso: string, r: Range) => iso >= r.from && iso <= r.to;
