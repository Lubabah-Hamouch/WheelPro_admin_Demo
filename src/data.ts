/**
 * Demo fixtures. Every client, vehicle, supplier, price, cost and invoice here is invented.
 * Dates are laid out relative to the visitor's today, so the period presets (today / this week /
 * this month / this year) always have something to show.
 */
import { addDays, computeInvoice, type DiscountUnit, type Invoice, type Line, type PayMethod } from "./calc";
import { nextNumber, syncStock, uid, type Client, type Part, type Service, type State, type TaxRate } from "./model";

export const TAX_RATES: TaxRate[] = [
  { id: "t20", nameFr: "TVA", nameEn: "VAT", percent: 20 },
  { id: "t10", nameFr: "TVA", nameEn: "VAT", percent: 10 },
  { id: "t0", nameFr: "Exonéré", nameEn: "No VAT", percent: 0 },
];

const SERVICES: Service[] = [
  { id: "s1", ref: "SRV-GEO", nameFr: "Géométrie / parallélisme", nameEn: "Wheel alignment", descFr: "Contrôle et réglage des quatre roues", descEn: "Four-wheel geometry check and adjustment", price: 250, taxId: "t20" , provider: "", purchasePrice: null },
  { id: "s2", ref: "SRV-EQ4", nameFr: "Équilibrage (4 roues)", nameEn: "Wheel balancing (4 wheels)", descFr: "Main-d'œuvre", descEn: "Labour", price: 160, taxId: "t20" , provider: "", purchasePrice: null },
  { id: "s3", ref: "SRV-EQ2", nameFr: "Équilibrage (2 roues)", nameEn: "Wheel balancing (2 wheels)", descFr: "Main-d'œuvre", descEn: "Labour", price: 90, taxId: "t20" , provider: "", purchasePrice: null },
  { id: "s4", ref: "SRV-MONT", nameFr: "Montage pneu", nameEn: "Tyre fitting", descFr: "Montage et valve, par pneu", descEn: "Fit and valve, per tyre", price: 40, taxId: "t20" , provider: "", purchasePrice: null },
  { id: "s5", ref: "SRV-FREIN", nameFr: "Entretien freinage", nameEn: "Brake service", descFr: "Main-d'œuvre, un essieu", descEn: "Labour, one axle", price: 300, taxId: "t20" , provider: "", purchasePrice: null },
  { id: "s6", ref: "SRV-DIAG", nameFr: "Diagnostic électronique", nameEn: "Diagnostic scan", descFr: "Lecture OBD et rapport", descEn: "OBD scan and report", price: 200, taxId: "t20" , provider: "", purchasePrice: null },
  { id: "s7", ref: "SRV-VID", nameFr: "Vidange moteur", nameEn: "Oil change", descFr: "Main-d'œuvre, vidange et remplissage", descEn: "Labour, drain and refill", price: 120, taxId: "t20" , provider: "", purchasePrice: null },
  { id: "s8", ref: "SRV-PERM", nameFr: "Permutation des pneus", nameEn: "Tyre rotation", descFr: "Main-d'œuvre", descEn: "Labour", price: 100, taxId: "t20" , provider: "", purchasePrice: null },
  { id: "s9", ref: "SRV-CREV", nameFr: "Réparation crevaison", nameEn: "Puncture repair", descFr: "Mèche ou champignon, par pneu", descEn: "Plug or patch, per tyre", price: 80, taxId: "t20" , provider: "", purchasePrice: null },
  { id: "s10", ref: "SRV-CLIM", nameFr: "Recharge climatisation", nameEn: "Air-con recharge", descFr: "Contrôle d'étanchéité et recharge", descEn: "Leak check and regas", price: 350, taxId: "t20" , provider: "", purchasePrice: null },
];

/** [part, quantity on the shelf today]. The opening stock is worked back from the sales. */
const PARTS: [Omit<Part, "qty">, number][] = [
  [{ id: "p1", ref: "PN-205-55-16", nameFr: "Pneu 205/55 R16", nameEn: "Tyre 205/55 R16", supplier: "Pneus Démo SARL", price: 750, cost: 540, threshold: 4, taxId: "t20" }, 14],
  [{ id: "p2", ref: "PN-215-60-16", nameFr: "Pneu 215/60 R16", nameEn: "Tyre 215/60 R16", supplier: "Pneus Démo SARL", price: 820, cost: 600, threshold: 4, taxId: "t20" }, 6],
  [{ id: "p3", ref: "PLQ-AV-118", nameFr: "Plaquettes de frein avant", nameEn: "Front brake pads", supplier: "Pièces Démo", price: 420, cost: 260, threshold: 3, taxId: "t20" }, 2],
  [{ id: "p4", ref: "DSQ-AV-260", nameFr: "Disque de frein avant", nameEn: "Front brake disc", supplier: "Pièces Démo", price: 380, cost: 230, threshold: 2, taxId: "t20" }, 8],
  [{ id: "p5", ref: "FH-114", nameFr: "Filtre à huile", nameEn: "Oil filter", supplier: "Pièces Démo", price: 85, cost: 42, threshold: 5, taxId: "t20" }, 22],
  [{ id: "p6", ref: "FA-221", nameFr: "Filtre à air", nameEn: "Air filter", supplier: "Pièces Démo", price: 120, cost: 60, threshold: 3, taxId: "t20" }, 9],
  [{ id: "p7", ref: "HUI-5W30", nameFr: "Huile moteur 5W-30, 1 L", nameEn: "Engine oil 5W-30, 1 L", supplier: "Lubrifiants Démo", price: 95, cost: 58, threshold: 10, taxId: "t10" }, 40],
  [{ id: "p8", ref: "BEG-550", nameFr: "Balais d'essuie-glace (paire)", nameEn: "Wiper blades (pair)", supplier: "", price: 160, cost: null, threshold: 2, taxId: "t20" }, -1],
  [{ id: "p9", ref: "BAT-70", nameFr: "Batterie 70 Ah", nameEn: "Battery 70 Ah", supplier: "Énergie Démo", price: 1150, cost: 860, threshold: 2, taxId: "t20" }, 1],
  [{ id: "p10", ref: "BOU-4X", nameFr: "Bougies d'allumage (jeu de 4)", nameEn: "Spark plugs (set of 4)", supplier: "Pièces Démo", price: 240, cost: 150, threshold: 3, taxId: "t20" }, 12],
  [{ id: "p11", ref: "LR-5L", nameFr: "Liquide de refroidissement 5 L", nameEn: "Coolant 5 L", supplier: "Lubrifiants Démo", price: 130, cost: 75, threshold: 3, taxId: "t20" }, 7],
];

const CLIENTS: Client[] = [
  { id: "c1", name: "Youssef A.", surname: "", mobile: "", phone: "06 00 00 01 01", email: "youssef.a@example.com", address: "12 rue des Lilas (démo)", zip: "", city: "Casablanca", ice: "", active: true },
  { id: "c2", name: "Nadia B.", surname: "", mobile: "", phone: "06 00 00 01 02", email: "nadia.b@example.com", address: "4 avenue des Palmiers (démo)", zip: "", city: "Rabat", ice: "", active: true },
  { id: "c3", name: "Omar K.", surname: "", mobile: "", phone: "06 00 00 01 03", email: "", address: "", zip: "", city: "Mohammédia", ice: "", active: true },
  { id: "c4", name: "Salma R.", surname: "", mobile: "", phone: "06 00 00 01 04", email: "salma.r@example.com", address: "", zip: "", city: "Casablanca", ice: "", active: true },
  { id: "c5", name: "Hamza T.", surname: "", mobile: "", phone: "06 00 00 01 05", email: "", address: "27 boulevard Atlas (démo)", zip: "", city: "Salé", ice: "", active: true },
  { id: "c6", name: "Imane L.", surname: "", mobile: "", phone: "06 00 00 01 06", email: "imane.l@example.com", address: "", zip: "", city: "Kénitra", ice: "", active: true },
  { id: "c7", name: "Mehdi S.", surname: "", mobile: "", phone: "06 00 00 01 07", email: "", address: "", zip: "", city: "Casablanca", ice: "", active: true },
  { id: "c8", name: "Rania F.", surname: "", mobile: "", phone: "06 00 00 01 08", email: "rania.f@example.com", address: "", zip: "", city: "Rabat", ice: "", active: true },
  { id: "c9", name: "Anas M.", surname: "", mobile: "", phone: "06 00 00 01 09", email: "", address: "", zip: "", city: "Témara", ice: "", active: false },
  { id: "c10", name: "Leila H.", surname: "", mobile: "", phone: "06 00 00 01 10", email: "leila.h@example.com", address: "9 rue du Port (démo)", zip: "", city: "Casablanca", ice: "", active: true },
  { id: "c11", name: "Sandline Couriers (démo)", surname: "", mobile: "", phone: "05 00 00 02 11", email: "fleet@sandline.example.com", address: "Zone industrielle, lot 14 (démo)", zip: "20250", city: "Casablanca", ice: "000000000000011", active: true },
  { id: "c12", name: "Blue Route Taxis (démo)", surname: "", mobile: "", phone: "05 00 00 02 12", email: "contact@blueroute.example.com", address: "", zip: "", city: "Rabat", ice: "000000000000012", active: true },
  { id: "c13", name: "Client de passage", surname: "", mobile: "", phone: "", email: "", address: "", zip: "", city: "", ice: "", active: true },
];

const VEHICLES = [
  ["Dacia Logan", "48213-B-7"],
  ["Renault Clio", "11872-A-1"],
  ["Peugeot 208", "90314-D-6"],
  ["Hyundai Accent", "27561-H-1"],
  ["Toyota Corolla", "63098-W-6"],
  ["Fiat Tipo", "15420-B-26"],
  ["Volkswagen Polo", "70236-A-8"],
  ["Kia Picanto", "38805-B-7"],
  ["Skoda Octavia", "52147-D-1"],
  ["Citroën C3", "84400-A-6"],
];

type Spec = {
  client: string;
  ago: number;
  lines: [string, number][];
  discount?: [DiscountUnit, string];
  /** [days after the invoice date, "full" | "half" | an amount, method] */
  pays?: [number, "full" | "half" | number, PayMethod][];
};

// Older than this, parts were sold before purchase costs were recorded: their lines carry none.
const COSTS_TRACKED_FROM = 115;

const SPECS: Spec[] = [
  { client: "c1", ago: 1, lines: [["PN-205-55-16", 4], ["SRV-MONT", 4], ["SRV-EQ4", 1]] },
  { client: "c2", ago: 2, lines: [["HUI-5W30", 5], ["FH-114", 1], ["SRV-VID", 1]], pays: [[0, "full", "cash"]] },
  { client: "c3", ago: 4, lines: [["PLQ-AV-118", 1], ["SRV-FREIN", 1]], pays: [[0, "half", "cash"]] },
  { client: "c11", ago: 6, lines: [["PN-215-60-16", 4], ["SRV-MONT", 4], ["SRV-GEO", 1], ["SRV-EQ4", 1]], discount: ["percent", "5"], pays: [[3, "full", "transfer"]] },
  { client: "c4", ago: 9, lines: [["SRV-DIAG", 1], ["BAT-70", 1]], pays: [[0, "full", "cash"]] },
  { client: "c13", ago: 11, lines: [["SRV-CREV", 1]], pays: [[0, "full", "cash"]] },
  { client: "c5", ago: 12, lines: [["BEG-550", 1], ["FA-221", 1], ["SRV-VID", 1], ["HUI-5W30", 4], ["FH-114", 1]], pays: [[0, "full", "cash"]] },
  { client: "c12", ago: 15, lines: [["PN-205-55-16", 2], ["SRV-MONT", 2], ["SRV-EQ2", 1]], discount: ["amount", "100"], pays: [[5, 1000, "cheque"]] },
  { client: "c6", ago: 19, lines: [["SRV-PERM", 1], ["SRV-GEO", 1]], pays: [[0, "full", "cash"]] },
  { client: "c7", ago: 24, lines: [["DSQ-AV-260", 2], ["PLQ-AV-118", 1], ["SRV-FREIN", 1]] },
  { client: "c8", ago: 31, lines: [["HUI-5W30", 5], ["FH-114", 1], ["FA-221", 1], ["SRV-VID", 1]], pays: [[0, "full", "cash"]] },
  { client: "c11", ago: 38, lines: [["PN-215-60-16", 2], ["SRV-MONT", 2], ["SRV-EQ2", 1]], pays: [[10, "full", "transfer"]] },
  { client: "c9", ago: 45, lines: [["BAT-70", 1], ["SRV-DIAG", 1]], pays: [[2, "half", "cash"]] },
  { client: "c10", ago: 52, lines: [["SRV-GEO", 1], ["SRV-EQ4", 1], ["SRV-CLIM", 1]], pays: [[0, "full", "cash"]] },
  { client: "c12", ago: 60, lines: [["PN-205-55-16", 4], ["SRV-MONT", 4], ["SRV-EQ4", 1], ["SRV-GEO", 1]], discount: ["percent", "10"], pays: [[7, "full", "transfer"]] },
  { client: "c1", ago: 68, lines: [["BEG-550", 2], ["SRV-DIAG", 1]], pays: [[0, "full", "cash"]] },
  { client: "c3", ago: 75, lines: [["HUI-5W30", 4], ["FH-114", 1], ["SRV-VID", 1], ["BOU-4X", 1]], pays: [[0, "full", "cheque"]] },
  { client: "c2", ago: 83, lines: [["PLQ-AV-118", 1], ["DSQ-AV-260", 2], ["SRV-FREIN", 1]], pays: [[1, "full", "transfer"]] },
  { client: "c4", ago: 95, lines: [["SRV-PERM", 1], ["PN-215-60-16", 2], ["SRV-MONT", 2]], pays: [[0, "full", "cash"]] },
  { client: "c5", ago: 110, lines: [["BAT-70", 1], ["LR-5L", 1]], pays: [[0, "full", "cash"]] },
  { client: "c11", ago: 124, lines: [["HUI-5W30", 5], ["FH-114", 1], ["FA-221", 1], ["SRV-VID", 1], ["BEG-550", 1]], pays: [[12, "full", "transfer"]] },
  { client: "c6", ago: 140, lines: [["SRV-DIAG", 1], ["SRV-GEO", 1]] },
  { client: "c8", ago: 160, lines: [["PN-205-55-16", 2], ["SRV-MONT", 2], ["SRV-EQ2", 1]], pays: [[0, "full", "cash"]] },
];

const OPENING_AGO = 200;

let lineSeq = 0;
export const lineKey = () => `l${++lineSeq}`;

export function emptyLine(taxId = "t20", rates: TaxRate[] = TAX_RATES): Line {
  return {
    key: lineKey(),
    productId: null,
    name: "",
    qty: "",
    price: "",
    discount: "",
    taxId,
    taxPercent: rates.find((r) => r.id === taxId)?.percent ?? 20,
    cost: null,
  };
}

export function buildState(today: string): State {
  const byRef = new Map<string, Service | Omit<Part, "qty">>();
  for (const s of SERVICES) byRef.set(s.ref, s);
  for (const [p] of PARTS) byRef.set(p.ref, p);

  const consumed = new Map<string, number>();
  for (const s of SPECS) for (const [ref, qty] of s.lines) consumed.set(ref, (consumed.get(ref) ?? 0) + qty);

  const opening = PARTS.map(([p, now]) => ({ ...p, qty: now + (consumed.get(p.ref) ?? 0) }));
  const openingAt = `${addDays(today, -OPENING_AGO)}T08:30:00`;

  let state: State = {
    today,
    clients: CLIENTS.map((c) => ({ ...c })),
    services: SERVICES.map((s) => ({ ...s })),
    parts: opening,
    invoices: [],
    movements: opening.map((p) => ({
      id: uid("mv"),
      partId: p.id,
      at: openingAt,
      change: p.qty,
      balance: p.qty,
      reason: "initial" as const,
      invoiceId: null,
      by: "admin" as const,
    })),
    taxRates: TAX_RATES,
    settings: {
      dateFormat: "dmy",
      dueDays: 15,
      readOnlyFrom: "paid",
      defaultTaxId: "t20",
      company: {
        name: "Wheel Pro Auto Service",
        activity: "Pneumatiques, géométrie, entretien (démo)",
        address: "1 rue de la Démo",
        city: "Casablanca",
        phone: "05 00 00 00 00",
        email: "contact@wheelpro.example.com",
        ice: "000000000000000",
        if: "00000000",
        rc: "000000",
        patente: "00000000",
        rib: "000 000 0000000000000000 00",
        cnss: "0000000",
      },
    },
  };

  const lineOf = (ref: string, qty: number, uncosted: boolean): Line => {
    const item = byRef.get(ref);
    if (!item) throw new Error(`no catalogue item ${ref}`);
    const rate = TAX_RATES.find((r) => r.id === item.taxId)!;
    const cost = "cost" in item && !uncosted ? item.cost : null;
    return {
      key: lineKey(),
      productId: item.id,
      name: item.nameFr,
      qty: String(qty),
      price: item.price.toFixed(2),
      discount: "",
      taxId: rate.id,
      taxPercent: rate.percent,
      cost,
    };
  };

  const ordered = [...SPECS].sort((a, b) => b.ago - a.ago);
  ordered.forEach((s, i) => {
    const date = addDays(today, -s.ago);
    const [model, plate] = VEHICLES[i % VEHICLES.length];
    const inv: Invoice = {
      id: uid("inv"),
      number: nextNumber(state.invoices, date),
      clientId: s.client,
      date,
      due: addDays(date, 15),
      issued: true,
      vehicle: `${model} / ${plate}`,
      includeCnss: false,
      includeRib: false,
      creditParentId: null,
      locked: false,
      discount: s.discount ? { unit: s.discount[0], value: s.discount[1] } : { unit: "percent", value: "" },
      lines: s.lines.map(([ref, qty]) => lineOf(ref, qty, s.ago > COSTS_TRACKED_FROM)),
      payments: [],
      seq: i + 1,
    };
    const total = computeInvoice(inv, today).total;
    inv.payments = (s.pays ?? []).map(([after, amt, method]) => {
      const amount = amt === "full" ? total : amt === "half" ? Math.round(total / 2) : amt;
      return { id: uid("pay"), date: addDays(date, Math.min(after, s.ago)), amount, method };
    });
    state = { ...state, invoices: [...state.invoices, inv] };
    state = { ...state, ...syncStock(state, inv, `${date}T${String(9 + (i % 8)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}:00`, "admin") };
  });

  // An open draft, written this morning: a fixed-amount discount over lines of different sizes,
  // so the last line visibly takes the rounding remainder.
  const draft: Invoice = {
    id: uid("inv"),
    number: null,
    clientId: "c10",
    date: today,
    due: addDays(today, 15),
    issued: false,
    vehicle: "Renault Mégane / 29034-A-1",
    includeCnss: false,
    includeRib: false,
    creditParentId: null,
    locked: false,
    discount: { unit: "amount", value: "100" },
    lines: [lineOf("PN-215-60-16", 2, false), lineOf("SRV-MONT", 2, false), lineOf("SRV-EQ2", 1, false), lineOf("HUI-5W30", 3, false)],
    payments: [],
    seq: ordered.length + 1,
  };

  state = { ...state, invoices: [...state.invoices, draft] };
  return { ...state, ...syncStock(state, draft, `${today}T08:55:00`, "admin") };
}
