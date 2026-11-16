/**
 * The printed documents: the facture, and the report PDFs. Each is a complete HTML page with its
 * own inline styles, opened in a new tab the way the real PDFs open, sized for A4 and ready for
 * the browser's "Save as PDF". The palette is the facture's own — #1A4FE0 blue, #1F2937 slate,
 * #F3F4F6 zebra, Arial — and nothing here follows the app's dark theme.
 */
import { computeInvoice, parse, r2, realLines, type Invoice } from "./calc";
import { amountToFrenchWords, formatAmount, formatCurrency, formatDate, formatQuantity, frPercent } from "./format";
import { clientLabel, findProduct, type State } from "./model";

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const METHOD_NAMES = { cash: "Espèces", cheque: "Chèque", transfer: "Virement" } as const;

const PAGE_CSS = `
  @page { size: A4; margin: 14mm 12mm; }
  html { background: #E5E7EB; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #1F2937; background: #FFFFFF;
         width: 186mm; min-height: 269mm; margin: 16px auto; padding: 14mm 12mm; box-sizing: content-box;
         box-shadow: 0 2px 12px rgba(0,0,0,.18); }
  @media print { html { background: none; } body { margin: 0; padding: 0; box-shadow: none; width: auto; min-height: 0; } .no-print { display: none !important; } }
  table { border-collapse: collapse; width: 100%; }
  .toolbar { position: fixed; top: 10px; right: 12px; font: 13px Arial, sans-serif; }
  .toolbar button { font: inherit; padding: 6px 12px; border: 1px solid #1A4FE0; background: #1A4FE0; color: #fff; border-radius: 4px; cursor: pointer; }
`;

const HEADER_CSS = `
  .hdr td { vertical-align: top; }
  .hdr-logo { width: 45%; }
  .hdr-co { width: 55%; text-align: right; line-height: 1.5; }
  .co-name { font-size: 14px; font-weight: bold; color: #1A4FE0; }
  .co-sub { color: #6B7280; }
  .section-bar { background: #1F2937; color: #FFFFFF; font-weight: bold; font-size: 11px; padding: 4px 8px; margin: 10px 0 6px; }
  .r { text-align: right; }
  .c { text-align: center; }
`;

function header(state: State, logoMaxHeight: number) {
  const co = state.settings.company;
  const address = [co.address.trim(), co.city.trim()].filter(Boolean).join(", ");
  const logo = `${window.location.origin}/logo-light.png`;
  return `
<table class="hdr">
  <tr>
    <td class="hdr-logo"><img id="invoice-logo" src="${logo}" alt="" style="max-width:100%;max-height:${logoMaxHeight}px"></td>
    <td class="hdr-co">
      <span class="co-name">${esc(co.name)}</span><br>
      ${co.activity ? `<span class="co-sub">${esc(co.activity)}</span><br>` : ""}
      ${address ? `${esc(address)}<br>` : ""}
      ${co.phone ? `Tél : ${esc(co.phone)}<br>` : ""}
      ${co.email ? `Email : ${esc(co.email)}` : ""}
    </td>
  </tr>
</table>`;
}

function toolbar(label: string) {
  return `<div class="toolbar no-print"><button type="button" onclick="window.print()">${esc(label)}</button></div>`;
}

/**
 * Shows a finished document as this tab's whole page. Documents have their own addresses
 * (#/invoices/:id/facture, #/reports/:slug/pdf) and are reached by ordinary links that open a
 * new tab, so no script ever opens a window and no pop-up blocker is involved.
 */
export function showDocument(html: string) {
  document.open();
  document.write(html);
  document.close();
}

/* ------------------------------------------------------------------ facture */

export function factureHtml(state: State, inv: Invoice, printLabel: string): string {
  const c = computeInvoice(inv, state.today);
  const co = state.settings.company;
  const client = state.clients.find((x) => x.id === inv.clientId);
  const fmt = state.settings.dateFormat;
  const lines = realLines(inv);

  // "Mode de règlement" prints the methods actually used, in the order first used.
  const methods: string[] = [];
  for (const p of [...inv.payments].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) {
    const name = METHOD_NAMES[p.method];
    if (!methods.includes(name)) methods.push(name);
  }

  const clientAddress = [client?.address ?? "", [client?.zip ?? "", client?.city ?? ""].filter((x) => x.trim()).join(" ")]
    .filter((x) => x.trim())
    .join(", ");
  // Empty address, phone or ICE drop their row; the name always prints, and the vehicle line is
  // kept even when blank, to be written in by hand.
  const clientRows: [string, string][] = (
    [
      ["Nom / Raison sociale", clientLabel(client)],
      ["Adresse", clientAddress],
      ["Téléphone", client?.phone ?? ""],
      ["ICE Client", client?.ice ?? ""],
    ] as [string, string][]
  ).filter(([, v]) => v.trim() !== "");
  clientRows.push(["Véhicule / Immatriculation", inv.vehicle]);

  // Whole-invoice discount: the lines' nets minus Total HT.
  let linesNet = 0;
  for (const l of lines) linesNet += r2(parse(l.qty) * parse(l.price)) - r2(parse(l.qty) * parse(l.discount));
  linesNet = r2(linesNet);
  const globalDiscount = r2(linesNet - c.net);

  // One row per tax rate, labelled with the rate's French name, highest rate first. A single rate
  // takes the invoice's own tax total; nothing taxable falls back to the default rate's label.
  let taxRows = c.vat.map((v) => ({ name: state.taxRates.find((r) => r.id === v.taxId)?.nameFr ?? "TVA", percent: v.percent, amount: v.amount }));
  if (taxRows.length === 1) taxRows[0].amount = c.vatTotal;
  if (taxRows.length === 0) {
    const def = lines.length ? undefined : state.taxRates.find((r) => r.id === state.settings.defaultTaxId);
    taxRows = [{ name: def?.nameFr ?? "TVA", percent: lines.length ? 0 : (def?.percent ?? 20), amount: c.vatTotal }];
  }
  taxRows.sort((a, b) => b.percent - a.percent || a.name.localeCompare(b.name));

  const items = lines
    .map((l, i) => {
      const prod = findProduct(state, l.productId);
      const qty = parse(l.qty);
      const disc = parse(l.discount);
      const net = r2(qty * parse(l.price)) - r2(qty * disc);
      return `
        <tr${i % 2 ? ' class="alt"' : ""}>
          <td class="c">${esc(prod?.ref ?? "")}</td>
          <td>${esc(l.name)}${disc !== 0 ? `<br><span class="note">Remise : ${formatAmount(disc)} / unité</span>` : ""}</td>
          <td class="r">${formatQuantity(qty)}</td>
          <td class="r">${formatAmount(parse(l.price))}</td>
          <td class="r">${formatAmount(net)}</td>
        </tr>`;
    })
    .join("");

  const discountPct = inv.discount.unit === "percent" && parse(inv.discount.value) ? ` (${frPercent(Math.min(100, parse(inv.discount.value)))} %)` : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>FACTURE ${esc(inv.number ?? "")}</title>
<style>
${PAGE_CSS}
${HEADER_CSS}
  .title-bar { background: #1A4FE0; color: #FFFFFF; font-size: 18px; font-weight: bold; text-align: center; padding: 7px 0; margin: 14px 0 8px; letter-spacing: 1px; }
  .meta td { padding: 2px 0; }
  .meta .m-lbl { font-weight: bold; width: 17%; }
  .meta .m-val { width: 33%; }
  .meta .r { text-align: right; padding-right: 6px; }
  .client td { padding: 3px 0; }
  .client .c-lbl { font-weight: bold; width: 30%; }
  .client .c-val { border-bottom: 1px solid #D1D5DB; }
  .items { margin-top: 4px; }
  .items th { background: #1A4FE0; color: #FFFFFF; font-size: 10px; padding: 6px; }
  .items td { padding: 6px; border-bottom: 1px solid #E5E7EB; }
  .items tbody tr.alt td { background: #F3F4F6; }
  .items .note { font-size: 8px; color: #6B7280; }
  .totals-wrap { margin-top: 6px; }
  .totals-wrap .spacer { width: 58%; }
  .totals td { padding: 5px 8px; }
  .totals .t-lbl { text-align: right; font-weight: bold; }
  .totals .t-amt { text-align: right; width: 42%; }
  .totals .sub td { border-bottom: 1px solid #E5E7EB; }
  .totals .ttc td { background: #1A4FE0; color: #FFFFFF; font-size: 12px; }
  .in-words { font-style: italic; color: #1F2937; margin: 10px 0 0; }
  .legal td { padding: 2px 0 2px 10px; }
  .ftr { margin-top: 22px; }
  .ftr .sign { font-weight: bold; }
  .ftr .thanks { text-align: right; font-style: italic; color: #1A4FE0; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style>
</head>
<body>
${toolbar(printLabel)}
${header(state, 100)}

<div class="title-bar">FACTURE</div>

<table class="meta">
  <tr>
    <td class="m-lbl">Facture N° :</td>
    <td class="m-val">${esc(inv.number ?? "")}</td>
    <td class="m-lbl r">Date :</td>
    <td class="m-val r">${formatDate(inv.date, fmt)}</td>
  </tr>
  <tr>
    <td class="m-lbl">Mode de règlement :</td>
    <td class="m-val">${esc(methods.join(", ") || "—")}</td>
    <td class="m-lbl r">Échéance :</td>
    <td class="m-val r">${formatDate(inv.due, fmt)}</td>
  </tr>
</table>

<div class="section-bar">CLIENT</div>
<table class="client">
${clientRows.map(([k, v]) => `  <tr><td class="c-lbl">${esc(k)} :</td><td class="c-val">${esc(v)}</td></tr>`).join("\n")}
</table>

<table class="items">
  <thead>
    <tr>
      <th style="width:11%">Réf.</th>
      <th style="width:34%; text-align:left;">Désignation</th>
      <th style="width:10%">Qté</th>
      <th style="width:16%">P.U. HT</th>
      <th style="width:29%">Total HT</th>
    </tr>
  </thead>
  <tbody>${items}
  </tbody>
</table>

<table class="totals-wrap">
  <tr>
    <td class="spacer"></td>
    <td>
      <table class="totals">
        ${
          globalDiscount > 0
            ? `<tr class="sub"><td class="t-lbl">Sous-total HT</td><td class="t-amt">${formatAmount(linesNet)}</td></tr>
        <tr class="sub"><td class="t-lbl">Remise globale${discountPct}</td><td class="t-amt">-${formatAmount(globalDiscount)}</td></tr>`
            : ""
        }
        <tr class="sub"><td class="t-lbl">Total HT</td><td class="t-amt">${formatAmount(c.net)}</td></tr>
        ${taxRows.map((t) => `<tr class="sub"><td class="t-lbl">${esc(t.name)} ${frPercent(t.percent)} %</td><td class="t-amt">${formatAmount(t.amount)}</td></tr>`).join("\n        ")}
        <tr class="ttc"><td class="t-lbl">TOTAL TTC</td><td class="t-amt">${formatCurrency(c.total)}</td></tr>
      </table>
    </td>
  </tr>
</table>

<p class="in-words">Arrêtée la présente facture à la somme de : ${esc(amountToFrenchWords(c.total))}.</p>

<div class="section-bar">IDENTIFIANTS LÉGAUX</div>
<table class="legal">
  <tr><td>ICE : ${esc(co.ice)}</td></tr>
  <tr><td>Identifiant Fiscal (IF) : ${esc(co.if)}</td></tr>
  <tr><td>Registre de Commerce (RC) : ${esc(co.rc)}</td></tr>
  <tr><td>Patente / Taxe Professionnelle : ${esc(co.patente)}</td></tr>
  ${inv.includeCnss ? `<tr><td>CNSS : ${esc(co.cnss)}</td></tr>` : ""}
  ${inv.includeRib ? `<tr><td>RIB / Banque : ${esc(co.rib)}</td></tr>` : ""}
</table>

<table class="ftr">
  <tr>
    <td class="sign">Cachet et signature</td>
    <td class="thanks">Merci de votre confiance</td>
  </tr>
</table>
</body>
</html>`;
}


/* ------------------------------------------------------------------ reports */

export type ReportTable = {
  /** A dark section bar above the table (the Profit & Tax report has several). */
  section?: string;
  head?: { label: string; right?: boolean }[];
  rows: (string | { text: string; right?: boolean; strong?: boolean })[][];
  foot?: (string | { text: string; right?: boolean })[];
  empty?: string;
  /** A caveat printed under the table, with the figures. */
  notes?: string[];
};

export function reportHtml(state: State, opts: { title: string; subtitle?: string; tables: ReportTable[]; lang: "en" | "fr"; printLabel: string; printedOn: string }) {
  const cell = (c: string | { text: string; right?: boolean; strong?: boolean }, tag = "td") => {
    const o = typeof c === "string" ? { text: c } : c;
    const body = esc(o.text);
    return `<${tag}${o.right ? ' class="r"' : ""}>${"strong" in o && o.strong ? `<strong>${body}</strong>` : body}</${tag}>`;
  };
  const tables = opts.tables
    .map(
      (t) => `
${t.section ? `<div class="section-bar">${esc(t.section)}</div>` : ""}
<table class="report">
  ${t.head ? `<thead><tr>${t.head.map((h) => `<th${h.right ? ' class="r"' : ""}>${esc(h.label)}</th>`).join("")}</tr></thead>` : ""}
  <tbody>
    ${
      t.rows.length === 0
        ? `<tr><td class="empty" colspan="${t.head?.length ?? 2}">${esc(t.empty ?? "")}</td></tr>`
        : t.rows.map((r, i) => `<tr${i % 2 ? ' class="alt"' : ""}>${r.map((c) => cell(c)).join("")}</tr>`).join("\n    ")
    }
  </tbody>
  ${t.foot && t.rows.length ? `<tfoot><tr>${t.foot.map((c) => cell(c)).join("")}</tr></tfoot>` : ""}
</table>
${(t.notes ?? []).map((n) => `<p class="note">${n}</p>`).join("")}`,
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="${opts.lang}">
<head>
<meta charset="utf-8">
<title>Wheel Pro &mdash; ${esc(opts.title)}</title>
<style>
${PAGE_CSS}
${HEADER_CSS}
  .title-bar { background: #1A4FE0; color: #FFFFFF; font-size: 16px; font-weight: bold; text-align: center; padding: 6px 0; margin: 14px 0 4px; letter-spacing: 1px; }
  .title-sub { text-align: center; color: #6B7280; margin: 0 0 8px; font-size: 10px; }
  .report { margin-top: 4px; }
  .report th { background: #1A4FE0; color: #FFFFFF; font-size: 10px; padding: 6px; text-align: left; }
  .report td { padding: 6px; border-bottom: 1px solid #E5E7EB; }
  .report tbody tr.alt td { background: #F3F4F6; }
  .report tfoot td { font-weight: bold; border-top: 2px solid #1F2937; border-bottom: none; background: #F3F4F6; }
  .report .empty { text-align: center; color: #6B7280; padding: 14px 6px; font-style: italic; }
  .r, .report th.r, .report td.r { text-align: right; }
  .note { background: #F3F4F6; border-left: 3px solid #1A4FE0; padding: 6px 8px; margin: 8px 0 0; font-size: 9px; line-height: 1.5; }
  .ftr { margin-top: 18px; color: #6B7280; font-size: 8px; }
  .ftr .printed { text-align: right; font-style: italic; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style>
</head>
<body>
${toolbar(opts.printLabel)}
${header(state, 80)}
<div class="title-bar">${esc(opts.title)}</div>
${opts.subtitle ? `<p class="title-sub">${esc(opts.subtitle)}</p>` : ""}
${tables}
<table class="ftr">
  <tr>
    <td>Wheel Pro</td>
    <td class="printed">${esc(opts.printedOn)}</td>
  </tr>
</table>
</body>
</html>`;
}


/** The CSV export: UTF-8 BOM, a sep=, line, a header row, then the rows; named "<Title>-<date>.csv". */
export function downloadCsv(title: string, today: string, header: (string | number)[], rows: (string | number)[][]) {
  const esc2 = (v: string | number) => {
    const s = String(v);
    return /[",\n\r ]/.test(s) && /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = "﻿sep=,\n" + [header, ...rows].map((r) => r.map(esc2).join(",")).join("\n") + "\n";
  const safe = title.replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8" }));
  a.download = `${safe}-${today}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
