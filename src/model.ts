/**
 * The demo's data model and the rules that keep its parts in step: invoice numbering, and the
 * stock that issued invoices consume.
 */
import { computeInvoice, realLines, parse, type Invoice } from "./calc";

export type Lang = "en" | "fr";
export type Role = "admin" | "staff";
export type Theme = "dark" | "light";

/**
 * The permission policy: capability → the roles that hold it. The same twelve capabilities, split
 * the same way, as the system this demo shows. Anything not listed is refused.
 */
const CAPABILITIES = {
  "dashboard.view": ["admin", "staff"],
  "clients.manage": ["admin", "staff"],
  "invoices.manage": ["admin", "staff"],
  "inventory.manage": ["admin", "staff"],
  "products.view": ["admin", "staff"],
  "reports.aging": ["admin", "staff"],
  "products.manage": ["admin"],
  "reports.sales": ["admin"],
  "inventory.cost": ["admin"],
  "settings.manage": ["admin"],
  "admin.pages": ["admin"],
  "records.delete": ["admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof CAPABILITIES;
export const can = (role: Role, cap: Capability) => (CAPABILITIES[cap] as readonly Role[]).includes(role);

export type TaxRate = { id: string; nameFr: string; nameEn: string; percent: number };

export type Service = {
  id: string;
  ref: string;
  nameFr: string;
  nameEn: string;
  descFr: string;
  descEn: string;
  price: number;
  taxId: string;
  provider: string;
  purchasePrice: number | null;
};

export type Part = {
  id: string;
  ref: string;
  nameFr: string;
  nameEn: string;
  supplier: string;
  price: number;
  /** What the part cost us. Null when nobody wrote it down — never read as 0. */
  cost: number | null;
  qty: number;
  threshold: number;
  taxId: string;
};

export type Client = {
  id: string;
  name: string;
  surname: string;
  phone: string;
  mobile: string;
  email: string;
  address: string;
  zip: string;
  city: string;
  ice: string;
  active: boolean;
};

/** Name then surname, the way every list, picker and the facture show a client. */
export const clientLabel = (c: Pick<Client, "name" | "surname"> | undefined) => (c ? [c.name, c.surname].filter((x) => x.trim()).join(" ") : "—");

export type Reason = "initial" | "sale" | "credit" | "sale_edit" | "sale_void" | "adjust" | "edit";

export type Movement = {
  id: string;
  partId: string;
  at: string; // ISO date-time
  change: number;
  balance: number;
  reason: Reason;
  invoiceId: string | null;
  by: Role;
};

export type Settings = {
  dateFormat: "dmy" | "ymd";
  dueDays: number;
  /** An invoice becomes read-only once it reaches this status. */
  readOnlyFrom: "unpaid" | "partial" | "paid";
  defaultTaxId: string;
  company: {
    name: string;
    activity: string;
    address: string;
    city: string;
    phone: string;
    email: string;
    ice: string;
    if: string;
    rc: string;
    patente: string;
    rib: string;
    cnss: string;
  };
};

export type State = {
  today: string;
  clients: Client[];
  services: Service[];
  parts: Part[];
  invoices: Invoice[];
  movements: Movement[];
  taxRates: TaxRate[];
  settings: Settings;
};

/** A catalogue entry as the invoice line search sees it: services and parts together. */
export type Product = (Service & { kind: "service" }) | (Part & { kind: "part"; descFr: string; descEn: string; provider: string; purchasePrice: number | null });

let seq = 1000;
export const uid = (p: string) => `${p}${++seq}`;

const RANK = { draft: 0, unpaid: 1, partial: 2, paid: 3 } as const;
export const isReadOnly = (status: keyof typeof RANK, from: Settings["readOnlyFrom"], locked = false) => locked || (status !== "draft" && RANK[status] >= RANK[from]);

export const productsOf = (s: Pick<State, "services" | "parts">): Product[] => [
  ...s.services.map((x) => ({ ...x, kind: "service" as const })),
  ...s.parts.map((x) => ({ ...x, kind: "part" as const, descFr: "", descEn: "", provider: x.supplier, purchasePrice: x.cost })),
];

export const findProduct = (s: Pick<State, "services" | "parts">, id: string | null): Product | undefined => {
  if (!id) return undefined;
  const sv = s.services.find((x) => x.id === id);
  if (sv) return { ...sv, kind: "service" };
  const p = s.parts.find((x) => x.id === id);
  return p ? { ...p, kind: "part", descFr: "", descEn: "", provider: p.supplier, purchasePrice: p.cost } : undefined;
};

/** Facture numbers read FAC-2026-001 and restart at 001 each calendar year. */
export function nextNumber(invoices: Invoice[], dateIso: string) {
  const year = dateIso.slice(0, 4);
  const prefix = `FAC-${year}-`;
  const max = invoices.reduce((m, i) => {
    if (!i.number?.startsWith(prefix)) return m;
    return Math.max(m, parseInt(i.number.slice(prefix.length), 10) || 0);
  }, 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

/**
 * Reconciles an invoice's stock rather than incrementing it: compares what the invoice should
 * consume now against the sum of its own past movements, and applies the difference. Editing a
 * quantity, removing a line and saving twice all settle correctly. A draft consumes nothing.
 * Stock may go negative: a real sale is never blocked.
 */
export function syncStock(state: State, inv: Invoice, at: string, by: Role): Pick<State, "parts" | "movements"> {
  // What the invoice's lines want now — on every save, whatever the status: a draft's parts are
  // set aside too. A credit note's negative quantities give stock back through the same sum.
  const should = new Map<string, number>();
  for (const l of realLines(inv)) {
    if (!l.productId || !state.parts.some((p) => p.id === l.productId)) continue;
    should.set(l.productId, (should.get(l.productId) ?? 0) + parse(l.qty));
  }
  const already = new Map<string, number>();
  for (const m of state.movements) {
    if (m.invoiceId !== inv.id) continue;
    already.set(m.partId, (already.get(m.partId) ?? 0) - m.change);
  }

  let parts = state.parts;
  const movements = [...state.movements];
  const ids = new Set([...should.keys(), ...already.keys()]);
  for (const partId of ids) {
    const diff = (should.get(partId) ?? 0) - (already.get(partId) ?? 0);
    if (diff === 0) continue;
    const part = parts.find((p) => p.id === partId);
    if (!part) continue;
    const balance = part.qty - diff;
    parts = parts.map((p) => (p.id === partId ? { ...p, qty: balance } : p));
    movements.push({
      id: uid("mv"),
      partId,
      at,
      change: -diff,
      balance,
      reason: (already.get(partId) ?? 0) === 0 ? (inv.creditParentId ? "credit" : "sale") : (should.get(partId) ?? 0) === 0 ? "sale_void" : "sale_edit",
      invoiceId: inv.id,
      by,
    });
  }
  return { parts, movements };
}

/** A typed amount, read the way the app reads one: "," is the thousands separator, "." the decimal point. */
export const standardizeAmount = (s: string) => {
  const n = parseFloat(String(s).replace(/[\s,]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export type PaymentError = "invoice" | "amount_required" | "exceeds_balance" | "date_required";

/** The rules every payment passes, in order: an amount, the invoice's sign and no more than the balance, a date. */
export function paymentError(total: number, balance: number, amount: number, date: string): PaymentError | null {
  const a = Math.round(amount * 100) / 100;
  const tot = Math.round(total * 100) / 100;
  const bal = Math.round(balance * 100) / 100;
  if (a === 0 || tot === 0) return "amount_required";
  if (a > 0 !== tot > 0 || Math.abs(a) > Math.abs(bal)) return "exceeds_balance";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "date_required";
  return null;
}

export const computeAll = (state: State) => new Map(state.invoices.map((i) => [i.id, computeInvoice(i, state.today)]));

export const nowStamp = (today: string) => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${today}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
