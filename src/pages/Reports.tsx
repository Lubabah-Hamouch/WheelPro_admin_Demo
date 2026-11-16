import { useEffect, useMemo, useState, type ReactNode } from "react";
import { inRange, isOpen, r2, type Range } from "../calc";
import { downloadCsv, reportHtml, showDocument, type ReportTable } from "../documents";
import { formatAmount, formatCurrency, formatDate } from "../format";
import { useI18n, type Key } from "../i18n";
import { clientLabel } from "../model";
import { useStore } from "../store";
import { Badge, DocLink, Fa, Link, PageHeader, rowLink } from "../ui";
import { balanceLabel } from "./InvoiceView";

type ReportDef = { slug: string; icon: string; title: Key; text: Key; admin: boolean };

const REPORTS: ReportDef[] = [
  { slug: "aging", icon: "clock-o", title: "rep_aging", text: "rep_aging_text", admin: false },
  { slug: "sales-client", icon: "users", title: "rep_sales_client", text: "rep_sales_client_text", admin: true },
  { slug: "invoices-client", icon: "file-text", title: "rep_invoices_client", text: "rep_invoices_client_text", admin: true },
  { slug: "monthly", icon: "calendar", title: "rep_monthly", text: "rep_monthly_text", admin: true },
  { slug: "profit-tax", icon: "line-chart", title: "rep_profit_tax", text: "rep_profit_tax_text", admin: true },
];

export function ReportsIndex() {
  const { can } = useStore();
  const { t } = useI18n();
  const visible = REPORTS.filter((r) => !r.admin || can("reports.sales"));
  return (
    <>
      <PageHeader title={t("nav_reports")} />
      <div id="content">
        <div className="wp-card-grid">
          {visible.map((r) => (
            <Link key={r.slug} className="wp-card wp-card--link" to={`reports/${r.slug}`}>
              <div className="wp-card-header">
                <span className="wp-card-title">
                  <Fa name={r.icon} /> {t(r.title)}
                </span>
                <i className="fa fa-angle-right" />
              </div>
              <div className="wp-card-body">{t(r.text)}</div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}

export function ReportPage({ slug }: { slug: string }) {
  const { can, navigate, setFlash } = useStore();
  const { t } = useI18n();
  const def = REPORTS.find((r) => r.slug === slug);
  const refused = !def || (def.admin && !can("reports.sales"));

  // A page the role may not open is refused, not just hidden: back to the dashboard, saying why.
  useEffect(() => {
    if (refused) {
      navigate("dashboard", true);
      setFlash({ tone: "warning", text: def ? t("not_allowed") : t("not_found_text") });
    }
  }, [refused]);
  if (refused) return null;

  switch (slug) {
    case "aging":
      return <Aging />;
    case "sales-client":
      return <SalesByClient />;
    case "invoices-client":
      return <InvoicesPerClient />;
    case "monthly":
      return <Monthly />;
    default:
      return <ProfitTax />;
  }
}

/* ---------- shared pieces ---------- */

/** The default period: 1 January to today, as the reports open — or the period a PDF link carries. */
function usePeriod() {
  const { state, route } = useStore();
  return useState<Range>(() => ({
    from: route.query.get("from") || `${state.today.slice(0, 4)}-01-01`,
    to: route.query.get("to") || state.today,
  }));
}

/** At #/reports/:slug/pdf the report renders as its printed document, in this tab. */
function useAutoDocument(build: () => void) {
  const doc = useStore().route.path[2] === "pdf";
  useEffect(() => {
    if (doc) build();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);
  return doc;
}

const pdfPath = (slug: string, r?: Range) => `reports/${slug}/pdf${r ? `?from=${r.from}&to=${r.to}` : ""}`;

function useInvoicesIn(range: Range | null, includeDrafts = false) {
  const { state, computed } = useStore();
  return useMemo(
    () =>
      state.invoices
        .filter((i) => (includeDrafts || i.issued) && (!range || inRange(i.date, range)))
        .sort((a, b) => (a.date === b.date ? a.seq - b.seq : a.date < b.date ? -1 : 1))
        .map((inv) => ({ inv, c: computed.get(inv.id)! })),
    [state.invoices, computed, range, includeDrafts],
  );
}

const csvNum = (n: number) => n.toFixed(2);

/** Every month in the period, quiet ones included, labelled as the real report does: 11/2026. */
function months(r: Range) {
  const out: { key: string; label: string }[] = [];
  const d = new Date(`${r.from.slice(0, 7)}-01T00:00:00`);
  const end = r.to.slice(0, 7);
  const keyOf = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`;
  for (let key = keyOf(d); key <= end; key = keyOf(d)) {
    out.push({ key, label: `${key.slice(5, 7)}/${key.slice(0, 4)}` });
    d.setMonth(d.getMonth() + 1);
  }
  return out;
}

/** The period form (a GET in the real app) and the export buttons, which carry the same dates. */
function PeriodFilter({ range, onRun, exports }: { range: Range; onRun: (r: Range) => void; exports: { pdf?: string; csv?: () => void } }) {
  const { t } = useI18n();
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  return (
    <div className="wp-card wp-report-filter">
      <div className="wp-card-body">
        <form
          className="wp-report-period"
          onSubmit={(e) => {
            e.preventDefault();
            if (from && to) onRun({ from, to });
          }}
        >
          <div className="form-group">
            <label htmlFor="from_date">{t("from_date")}</label>
            <input id="from_date" type="date" className="form-control" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="form-group">
            <label htmlFor="to_date">{t("to_date")}</label>
            <input id="to_date" type="date" className="form-control" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="form-group">
            <button type="submit" className="btn btn-primary">
              <Fa name="search" fw={false} /> {t("run_report")}
            </button>
          </div>
        </form>
        <div className="wp-report-exports">
          {exports.pdf && (
            <DocLink to={exports.pdf} className="btn btn-default">
              <Fa name="file-pdf-o" fw={false} /> {t("export_pdf")}
            </DocLink>
          )}
          {exports.csv && (
            <button type="button" className="btn btn-default" onClick={exports.csv}>
              <Fa name="file-excel-o" fw={false} /> {t("export_csv")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ReportShell({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <>
      <PageHeader back="reports" title={title} actions={actions} />
      <div id="content">{children}</div>
    </>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="wp-card wp-card--stat">
      <div className="wp-stat-label">{label}</div>
      <div className="wp-stat-value wp-stat-value--money">{value}</div>
      {sub && <div className="wp-stat-sub">{sub}</div>}
    </div>
  );
}

/** Opens a report document in the interface language (Profit & Tax asks for French itself). */
function useOpenPdf() {
  const { state } = useStore();
  const { t, lang } = useI18n();
  return (title: string, tables: ReportTable[], subtitle?: string, french = false) =>
    showDocument(reportHtml(state, {
      title,
      subtitle,
      tables,
      lang: french ? "fr" : lang,
      printLabel: french ? "Imprimer" : t("print"),
      printedOn: french ? `Édité le ${formatDate(state.today, state.settings.dateFormat)}` : t("printed_on", { date: formatDate(state.today, state.settings.dateFormat) }),
    }));
}

/* ---------- Invoice Aging ---------- */

function Aging() {
  const { state, computed, navigate } = useStore();
  const { t, money, date } = useI18n();
  const pdf = useOpenPdf();
  const rows = state.invoices
    .map((inv) => ({ inv, c: computed.get(inv.id)! }))
    .filter(({ c }) => c.overdue)
    .sort((a, b) => (a.inv.due < b.inv.due ? -1 : 1));
  const bucket = (d: number) => (d <= 15 ? 0 : d <= 30 ? 1 : 2);
  const BUCKETS = [t("aging_1_15"), t("aging_16_30"), t("aging_above_30")];
  const total = r2(rows.reduce((s, r) => s + r.c.balance, 0));
  const name = (id: string) => clientLabel(state.clients.find((c) => c.id === id));

  // The printed version is the classic summary: one row per client, split by age.
  const exportPdf = () => {
    const by = new Map<string, number[]>();
    for (const { inv, c } of rows) {
      const v = by.get(inv.clientId) ?? [0, 0, 0];
      v[bucket(c.daysOverdue)] = r2(v[bucket(c.daysOverdue)] + c.balance);
      by.set(inv.clientId, v);
    }
    const list = [...by.entries()].sort((a, b) => name(a[0]).localeCompare(name(b[0]), "fr"));
    const sums = [0, 1, 2].map((i) => r2(list.reduce((s, [, v]) => s + v[i], 0)));
    pdf(t("rep_aging"), [
      {
        head: [{ label: t("client") }, ...BUCKETS.map((b) => ({ label: b, right: true })), { label: t("total"), right: true }],
        rows: list.map(([id, v]) => [name(id), ...v.map((x) => ({ text: formatCurrency(x), right: true })), { text: formatCurrency(r2(v[0] + v[1] + v[2])), right: true }]),
        foot: [t("total"), ...sums.map((x) => ({ text: formatCurrency(x), right: true })), { text: formatCurrency(r2(sums[0] + sums[1] + sums[2])), right: true }],
        empty: t("nothing_period"),
      },
    ]);
  };

  if (useAutoDocument(exportPdf)) return null;

  return (
    <ReportShell
      title={t("rep_aging")}
      actions={
        <DocLink to={pdfPath("aging")} className="btn btn-default">
          <Fa name="file-pdf-o" fw={false} /> {t("export_pdf")}
        </DocLink>
      }
    >
      <div className="wp-card">
        <div className="wp-card-header">
          <span className="wp-card-title">
            <Fa name="clock-o" /> {t("overdue_invoices")}
          </span>
          <Badge tone={rows.length ? "overdue" : "neutral"}>{t("invoices_count_n", { n: rows.length })}</Badge>
        </div>
        {rows.length === 0 ? (
          <div className="wp-card-body text-success">✓ {t("nothing_overdue")}</div>
        ) : (
          <div className="table-responsive">
            <table className="wp-table table-hover table-striped">
              <thead>
                <tr>
                  <th>{t("invoice")}</th>
                  <th>{t("client")}</th>
                  <th>{t("due_date")}</th>
                  <th>{t("days_late")}</th>
                  <th className="text-right">{t("balance")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ inv, c }) => (
                  <tr key={inv.id} {...rowLink(navigate, `invoices/${inv.id}`)}>
                    <td>{inv.number || t("wp_draft")}</td>
                    <td>{name(inv.clientId)}</td>
                    <td>{date(inv.due)}</td>
                    <td>
                      <Badge tone="overdue">{BUCKETS[bucket(c.daysOverdue)]}</Badge> <span className="text-muted">{t("days_overdue", { n: c.daysOverdue })}</span>
                    </td>
                    <td className="wp-num">{balanceLabel(c, money, t)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={4}>{t("total")}</th>
                  <th className="wp-num">{money(total)}</th>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </ReportShell>
  );
}

/* ---------- Sales by Client ---------- */

function SalesByClient() {
  const { state, navigate } = useStore();
  const { t, money, date } = useI18n();
  const pdf = useOpenPdf();
  const [range, setRange] = usePeriod();
  const data = useInvoicesIn(range);
  const name = (id: string) => clientLabel(state.clients.find((c) => c.id === id));
  const rows = useMemo(() => {
    const m = new Map<string, { id: string; count: number; sales: number; gross: number }>();
    for (const { inv, c } of data) {
      const r = m.get(inv.clientId) ?? { id: inv.clientId, count: 0, sales: 0, gross: 0 };
      r.count++;
      r.sales = r2(r.sales + c.net);
      r.gross = r2(r.gross + c.total);
      m.set(inv.clientId, r);
    }
    return [...m.values()].sort((a, b) => name(a.id).localeCompare(name(b.id), "fr"));
  }, [data]);
  const tot = { count: rows.reduce((s, r) => s + r.count, 0), sales: r2(rows.reduce((s, r) => s + r.sales, 0)), gross: r2(rows.reduce((s, r) => s + r.gross, 0)) };
  const period = `${date(range.from)} — ${date(range.to)}`;
  const exportPdf = () =>
            pdf(
              t("rep_sales_client"),
              [
                {
                  head: [{ label: t("client") }, { label: t("invoice_count"), right: true }, { label: t("sales"), right: true }, { label: t("sales_with_tax"), right: true }],
                  rows: rows.map((r) => [name(r.id), { text: String(r.count), right: true }, { text: formatCurrency(r.sales), right: true }, { text: formatCurrency(r.gross), right: true }]),
                  foot: [t("total"), { text: String(tot.count), right: true }, { text: formatCurrency(tot.sales), right: true }, { text: formatCurrency(tot.gross), right: true }],
                  empty: t("nothing_period"),
                },
              ],
              period,
            );
  if (useAutoDocument(exportPdf)) return null;

  return (
    <ReportShell title={t("rep_sales_client")}>
      <PeriodFilter
        range={range}
        onRun={setRange}
        exports={{
          pdf: pdfPath("sales-client", range),
          csv: () =>
            downloadCsv(t("rep_sales_client"), state.today, [t("client"), t("invoice_count"), t("sales"), t("sales_with_tax")], rows.map((r) => [name(r.id), r.count, csvNum(r.sales), csvNum(r.gross)])),
        }}
      />
      <div className="wp-card">
        <div className="wp-card-header">
          <span className="wp-card-title">
            <Fa name="users" /> {t("rep_sales_client")}
          </span>
          <Badge>{period}</Badge>
        </div>
        {rows.length === 0 ? (
          <div className="wp-card-body text-muted">{t("nothing_period")}</div>
        ) : (
          <div className="table-responsive">
            <table className="wp-table table-hover table-striped">
              <thead>
                <tr>
                  <th>{t("client")}</th>
                  <th className="text-right">{t("invoice_count")}</th>
                  <th className="text-right">{t("sales")}</th>
                  <th className="text-right">{t("sales_with_tax")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} {...rowLink(navigate, `clients/${r.id}`)}>
                    <td>{name(r.id)}</td>
                    <td className="wp-num">{r.count}</td>
                    <td className="wp-num">{money(r.sales)}</td>
                    <td className="wp-num">{money(r.gross)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th>{t("total")}</th>
                  <th className="wp-num">{tot.count}</th>
                  <th className="wp-num">{money(tot.sales)}</th>
                  <th className="wp-num">{money(tot.gross)}</th>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </ReportShell>
  );
}

/* ---------- Invoices per Client ---------- */

function InvoicesPerClient() {
  const { state, navigate } = useStore();
  const { t, money, date, statusLabel } = useI18n();
  const [range, setRange] = usePeriod();
  const data = useInvoicesIn(range, true);
  const name = (id: string) => clientLabel(state.clients.find((c) => c.id === id));
  const groups = useMemo(() => {
    const m = new Map<string, typeof data>();
    for (const row of data) m.set(row.inv.clientId, [...(m.get(row.inv.clientId) ?? []), row]);
    return [...m.entries()].sort((a, b) => name(a[0]).localeCompare(name(b[0]), "fr"));
  }, [data]);

  return (
    <ReportShell title={t("rep_invoices_client")}>
      <PeriodFilter
        range={range}
        onRun={setRange}
        exports={{
          csv: () =>
            downloadCsv(
              t("rep_invoices_client"),
              state.today,
              [t("client"), t("date"), t("invoice"), t("status"), t("total")],
              groups.flatMap(([, rows]) => rows.map(({ inv, c }) => [name(inv.clientId), formatDate(inv.date, state.settings.dateFormat), inv.number || t("wp_draft"), statusLabel(c.status), csvNum(c.total)])),
            ),
        }}
      />
      {groups.length === 0 && (
        <div className="wp-card">
          <div className="wp-card-body text-muted">{t("nothing_period")}</div>
        </div>
      )}
      {groups.map(([clientId, rows]) => (
        <div className="wp-card" key={clientId}>
          <div className="wp-card-header">
            <span className="wp-card-title">
              <Fa name="user" /> <Link to={`clients/${clientId}`}>{name(clientId)}</Link>
            </span>
            <Badge>{t("invoices_count_n", { n: rows.length })}</Badge>
          </div>
          <div className="table-responsive">
            <table className="wp-table table-hover table-striped">
              <thead>
                <tr>
                  <th>{t("date")}</th>
                  <th>{t("invoice")}</th>
                  <th>{t("status")}</th>
                  <th className="text-right">{t("total")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ inv, c }) => (
                  <tr key={inv.id} {...rowLink(navigate, `invoices/${inv.id}`)}>
                    <td>{date(inv.date)}</td>
                    <td>{inv.number || t("wp_draft")}</td>
                    <td>
                      <Badge tone={c.status}>{statusLabel(c.status)}</Badge>
                    </td>
                    <td className="wp-num">{money(c.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={3}>{t("total")}</th>
                  <th className="wp-num">{money(r2(rows.reduce((s, r) => s + r.c.total, 0)))}</th>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ))}
    </ReportShell>
  );
}

/* ---------- Monthly revenue ---------- */

function Monthly() {
  const { state, computed } = useStore();
  const { t, money, date } = useI18n();
  const pdf = useOpenPdf();
  const [range, setRange] = usePeriod();
  const rows = useMemo(() => {
    const ms = months(range).map((m) => ({ ...m, invoiced: 0, vat: 0, collected: 0, outstanding: 0 }));
    const by = new Map(ms.map((m) => [m.key, m]));
    for (const inv of state.invoices) {
      if (!inv.issued) continue;
      const c = computed.get(inv.id)!;
      // Collected on a cash basis: each payment lands in its own month.
      for (const p of inv.payments) {
        const m = inRange(p.date, range) ? by.get(p.date.slice(0, 7)) : undefined;
        if (m) m.collected = r2(m.collected + p.amount);
      }
      const m = inRange(inv.date, range) ? by.get(inv.date.slice(0, 7)) : undefined;
      if (!m) continue;
      m.invoiced = r2(m.invoiced + c.total);
      m.vat = r2(m.vat + c.vatTotal);
      if (isOpen(c)) m.outstanding = r2(m.outstanding + c.balance);
    }
    return ms;
  }, [state.invoices, computed, range]);
  const sum = (k: "invoiced" | "vat" | "collected" | "outstanding") => r2(rows.reduce((s, r) => s + r[k], 0));
  const period = `${date(range.from)} — ${date(range.to)}`;
  const head = [{ label: t("period") }, { label: t("rep_invoiced"), right: true }, { label: t("vat"), right: true }, { label: t("collected"), right: true }, { label: t("outstanding"), right: true }];
  const exportPdf = () =>
            pdf(
              t("rep_monthly"),
              [
                {
                  head,
                  rows: rows.map((r) => [r.label, ...[r.invoiced, r.vat, r.collected, r.outstanding].map((x) => ({ text: formatCurrency(x), right: true }))]),
                  foot: [t("total"), ...[sum("invoiced"), sum("vat"), sum("collected"), sum("outstanding")].map((x) => ({ text: formatCurrency(x), right: true }))],
                  empty: t("nothing_period"),
                },
              ],
              period,
            );
  if (useAutoDocument(exportPdf)) return null;

  return (
    <ReportShell title={t("rep_monthly")}>
      <PeriodFilter
        range={range}
        onRun={setRange}
        exports={{
          pdf: pdfPath("monthly", range),
          csv: () =>
            downloadCsv(t("rep_monthly"), state.today, head.map((h) => h.label), rows.map((r) => [r.label, csvNum(r.invoiced), csvNum(r.vat), csvNum(r.collected), csvNum(r.outstanding)])),
        }}
      />
      <div className="wp-dash-stats">
        <Tile label={t("rep_invoiced")} value={money(sum("invoiced"))} sub={t("invoiced_sub")} />
        <Tile label={t("vat")} value={money(sum("vat"))} sub={t("vat_sub")} />
        <Tile label={t("collected")} value={money(sum("collected"))} sub={t("collected_sub")} />
        <Tile label={t("outstanding")} value={money(sum("outstanding"))} sub={t("outstanding_sub")} />
      </div>
      <div className="wp-card">
        <div className="wp-card-header">
          <span className="wp-card-title">
            <Fa name="calendar" /> {t("rep_monthly")}
          </span>
          <Badge>{period}</Badge>
        </div>
        <div className="table-responsive">
          <table className="wp-table table-hover table-striped">
            <thead>
              <tr>
                {head.map((h) => (
                  <th key={h.label} className={h.right ? "text-right" : undefined}>
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td>{r.label}</td>
                  <td className="wp-num">{money(r.invoiced)}</td>
                  <td className="wp-num">{money(r.vat)}</td>
                  <td className="wp-num">{money(r.collected)}</td>
                  <td className="wp-num">{money(r.outstanding)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>{t("total")}</th>
                <th className="wp-num">{money(sum("invoiced"))}</th>
                <th className="wp-num">{money(sum("vat"))}</th>
                <th className="wp-num">{money(sum("collected"))}</th>
                <th className="wp-num">{money(sum("outstanding"))}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </ReportShell>
  );
}

/* ---------- Profit & Tax ---------- */

/**
 * Revenue is excluding tax; cost is each line's frozen unit cost, never today's; and a line with
 * no recorded cost is NOT counted as 100 % margin. Tax is grouped by the rate's name.
 */
function ProfitTax() {
  const { state } = useStore();
  const { t, money, date, lang } = useI18n();
  const pdf = useOpenPdf();
  const [range, setRange] = usePeriod();
  const data = useInvoicesIn(range);

  const report = useMemo(() => {
    const ms = months(range).map((m) => ({ ...m, revenue: 0, costed: 0, cogs: 0, uncosted: 0, tax: 0 }));
    const byMonth = new Map(ms.map((m) => [m.key, m]));
    const taxes = new Map<string, number>();
    const detail: { key: string; date: string; number: string; name: string; qty: number; revenue: number; cost: number | null; tax: number; taxLabel: string; margin: number | null }[] = [];
    const s = { revenue: 0, costed: 0, uncosted: 0, cogs: 0, tax: 0 };

    for (const { inv, c } of data) {
      const m = byMonth.get(inv.date.slice(0, 7));
      for (const l of c.lines) {
        const cost = l.line.cost === null ? null : r2(l.line.cost * l.qty);
        s.revenue += l.revenue;
        s.tax += l.tax;
        if (m) {
          m.revenue += l.revenue;
          m.tax += l.tax;
        }
        if (cost === null) {
          s.uncosted += l.revenue;
          if (m) m.uncosted += l.revenue;
        } else {
          s.costed += l.revenue;
          s.cogs += cost;
          if (m) {
            m.costed += l.revenue;
            m.cogs += cost;
          }
        }
        const rateName = state.taxRates.find((r) => r.id === l.line.taxId)?.nameFr ?? "";
        if (l.tax !== 0) taxes.set(rateName, r2((taxes.get(rateName) ?? 0) + l.tax));
        detail.push({
          key: l.key,
          date: inv.date,
          number: inv.number ?? "",
          name: l.line.name,
          qty: l.qty,
          revenue: l.revenue,
          cost,
          tax: l.tax,
          taxLabel: `${rateName} ${l.line.taxPercent} %`,
          margin: cost === null ? null : r2(l.revenue - cost),
        });
      }
    }
    const profit = r2(s.costed - s.cogs);
    return {
      revenue: r2(s.revenue),
      uncosted: r2(s.uncosted),
      cogs: r2(s.cogs),
      tax: r2(s.tax),
      profit,
      margin: s.costed ? (profit / s.costed) * 100 : null,
      uncostedShare: s.revenue ? (s.uncosted / s.revenue) * 100 : 0,
      taxes: [...taxes.entries()],
      months: ms.map((m) => ({ ...m, revenue: r2(m.revenue), cogs: r2(m.cogs), uncosted: r2(m.uncosted), tax: r2(m.tax), profit: r2(m.costed - m.cogs) })),
      detail,
    };
  }, [data, range, state.taxRates]);

  const pct = (n: number, d = 1) => (Math.round(n * 10 ** d) / 10 ** d).toString().replace(".", lang === "fr" ? "," : ".");
  const Unc = () => <span className="wp-empty">—</span>;
  const period = `${date(range.from)} — ${date(range.to)}`;
  const fmt = state.settings.dateFormat;

  // The printed report is French whatever the interface language, with its own wording.
  const exportPdf = () =>
    pdf(
      "RENTABILITÉ ET TAXES",
      [
        {
          section: "RÉSUMÉ DE LA PÉRIODE",
          rows: [
            ["Chiffre d'affaires HT", { text: formatCurrency(report.revenue), right: true }],
            ["Coût des marchandises vendues", { text: formatCurrency(report.cogs), right: true }],
            [
              { text: `Marge brute${report.margin === null ? "" : ` (${(Math.round(report.margin * 100) / 100).toString().replace(".", ",")} %)`}`, strong: true },
              { text: formatCurrency(report.profit), right: true, strong: true },
            ],
            ["Chiffre d'affaires sans coût enregistré", { text: formatCurrency(report.uncosted), right: true }],
            ["Taxes collectées", { text: formatCurrency(report.tax), right: true }],
          ],
          notes:
            report.uncosted !== 0
              ? [
                  `<strong>À noter :</strong> ${formatCurrency(report.uncosted)} (${(Math.round(report.uncostedShare * 10) / 10).toString().replace(".", ",")}&nbsp;%) du chiffre d'affaires provient de lignes dont le coût d'achat n'a pas été enregistré — prestations de main-d'œuvre, ou pièces vendues avant l'enregistrement des coûts. La marge brute ci-dessus ne porte que sur les lignes dont le coût est connu : la rentabilité réelle de la période n'est donc pas entièrement mesurable.`,
                ]
              : [],
        },
        {
          section: "TAXES COLLECTÉES PAR TYPE",
          head: [{ label: "Taxe" }, { label: "Montant", right: true }],
          rows: report.taxes.map(([n, a]) => [n, { text: formatCurrency(a), right: true }]),
          foot: ["TOTAL", { text: formatCurrency(report.tax), right: true }],
          empty: "Aucune taxe collectée sur la période.",
        },
        {
          section: "DÉTAIL PAR ARTICLE / SERVICE",
          head: [
            { label: "Date" },
            { label: "Facture" },
            { label: "Article / Service" },
            { label: "Qté", right: true },
            { label: "Prix de vente HT", right: true },
            { label: "Coût", right: true },
            { label: "Taxe" },
            { label: "Montant taxe", right: true },
            { label: "Marge", right: true },
          ],
          rows: report.detail.map((d) => [
            formatDate(d.date, fmt),
            d.number,
            d.name,
            { text: formatAmount(d.qty), right: true },
            { text: formatAmount(d.revenue), right: true },
            { text: d.cost === null ? "—" : formatAmount(d.cost), right: true },
            d.taxLabel || "—",
            { text: formatAmount(d.tax), right: true },
            { text: d.margin === null ? "—" : formatAmount(d.margin), right: true },
          ]),
          foot: [
            { text: "TOTAL" },
            "",
            "",
            { text: "—", right: true },
            { text: formatAmount(report.revenue), right: true },
            { text: formatAmount(report.cogs), right: true },
            "",
            { text: formatAmount(r2(report.detail.reduce((x, d) => x + d.tax, 0))), right: true },
            { text: formatAmount(report.profit), right: true },
          ],
          empty: "Aucune ligne sur la période.",
        },
        {
          section: "DÉTAIL PAR MOIS",
          head: [
            { label: "Période" },
            { label: "CA HT", right: true },
            { label: "Coût", right: true },
            { label: "Marge", right: true },
            { label: "Sans coût", right: true },
            { label: "Taxes", right: true },
          ],
          rows: report.months.map((m) => [m.label, ...[m.revenue, m.cogs, m.profit, m.uncosted, m.tax].map((x) => ({ text: formatAmount(x), right: true }))]),
          foot: ["TOTAL", ...[report.revenue, report.cogs, report.profit, report.uncosted, report.tax].map((x) => ({ text: formatAmount(x), right: true }))],
          empty: "Aucune donnée sur la période.",
        },
      ],
      `${formatDate(range.from, fmt)} — ${formatDate(range.to, fmt)}`,
      true,
    );

  // One file: the summary, the tax rows, the line detail, then the months.
  const exportCsv = () => {
    const rows: (string | number)[][] = [
      [t("rep_revenue_ht"), csvNum(report.revenue)],
      [t("cogs"), csvNum(report.cogs)],
      [t("gross_profit"), csvNum(report.profit)],
      [t("margin_pct"), report.margin === null ? "" : csvNum(report.margin)],
      [t("no_cost_recorded"), csvNum(report.uncosted)],
      [t("tax_collected"), csvNum(report.tax)],
      [],
      ...report.taxes.map(([n, a]) => [n, csvNum(a)]),
      [],
      [t("date"), t("invoice"), t("item_service"), t("quantity"), t("rep_revenue_ht"), t("cogs"), t("tax_rate"), t("tax_collected"), t("margin_col")],
      ...report.detail.map((d) => [formatDate(d.date, fmt), d.number, d.name, d.qty, csvNum(d.revenue), d.cost === null ? "" : csvNum(d.cost), d.taxLabel, csvNum(d.tax), d.margin === null ? "" : csvNum(d.margin)]),
      [],
      [t("period"), t("rep_revenue_ht"), t("cogs"), t("gross_profit"), t("no_cost_recorded"), t("tax_collected")],
      ...report.months.map((m) => [m.label, csvNum(m.revenue), csvNum(m.cogs), csvNum(m.profit), csvNum(m.uncosted), csvNum(m.tax)]),
    ];
    downloadCsv(t("rep_profit_tax"), state.today, [t("rep_profit_tax"), `${formatDate(range.from, fmt)} - ${formatDate(range.to, fmt)}`], rows);
  };

  if (useAutoDocument(exportPdf)) return null;

  return (
    <ReportShell title={t("rep_profit_tax")}>
      <PeriodFilter range={range} onRun={setRange} exports={{ pdf: pdfPath("profit-tax", range), csv: exportCsv }} />

      <div className="wp-dash-stats">
        <Tile label={t("rep_revenue_ht")} value={money(report.revenue)} sub={t("rep_revenue_sub")} />
        <Tile label={t("cogs")} value={money(report.cogs)} sub={t("cogs_sub")} />
        <Tile label={t("gross_profit")} value={money(report.profit)} sub={report.margin === null ? "—" : t("margin_sub", { pct: pct(report.margin) })} />
        <Tile label={t("tax_collected")} value={money(report.tax)} sub={t("tax_collected_sub")} />
      </div>

      {report.uncosted !== 0 && (
        <div className="alert alert-warning" role="note">
          <i className="fa fa-info-circle fa-margin" /> {t("uncosted_warning", { amount: money(report.uncosted), pct: pct(report.uncostedShare) })}
        </div>
      )}

      <div className="wp-card">
        <div className="wp-card-header">
          <span className="wp-card-title">
            <Fa name="percent" /> {t("tax_breakdown")}
          </span>
        </div>
        <div className="table-responsive">
          <table className="wp-table table-hover table-striped">
            <thead>
              <tr>
                <th>{t("tax_rate")}</th>
                <th className="text-right">{t("tax_collected")}</th>
              </tr>
            </thead>
            <tbody>
              {report.taxes.length === 0 && (
                <tr>
                  <td colSpan={2} className="text-muted">
                    {t("nothing_period")}
                  </td>
                </tr>
              )}
              {report.taxes.map(([n, a]) => (
                <tr key={n}>
                  <td>{n}</td>
                  <td className="wp-num">{money(a)}</td>
                </tr>
              ))}
            </tbody>
            {report.taxes.length > 0 && (
              <tfoot>
                <tr>
                  <th>{t("total")}</th>
                  <th className="wp-num">{money(report.tax)}</th>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="wp-card">
        <div className="wp-card-header">
          <span className="wp-card-title">
            <Fa name="list" /> {t("detail_by_item")}
          </span>
          <Badge>{period}</Badge>
        </div>
        <div className="table-responsive">
          <table className="wp-table table-hover table-striped">
            <thead>
              <tr>
                <th>{t("date")}</th>
                <th>{t("invoice")}</th>
                <th>{t("item_service")}</th>
                <th className="text-right">{t("quantity")}</th>
                <th className="text-right">{t("rep_revenue_ht")}</th>
                <th className="text-right">{t("cogs")}</th>
                <th>{t("tax_rate")}</th>
                <th className="text-right">{t("tax_collected")}</th>
                <th className="text-right">{t("margin_col")}</th>
              </tr>
            </thead>
            <tbody>
              {report.detail.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-muted">
                    {t("nothing_period")}
                  </td>
                </tr>
              )}
              {report.detail.map((d) => (
                <tr key={d.key}>
                  <td className="wp-nowrap">{date(d.date)}</td>
                  <td className="wp-nowrap">{d.number}</td>
                  <td>{d.name}</td>
                  <td className="wp-num">{formatAmount(d.qty)}</td>
                  <td className="wp-num">{money(d.revenue)}</td>
                  <td className="wp-num">{d.cost === null ? <Unc /> : money(d.cost)}</td>
                  <td>{d.taxLabel || <Unc />}</td>
                  <td className="wp-num">{money(d.tax)}</td>
                  <td className="wp-num">{d.margin === null ? <Unc /> : money(d.margin)}</td>
                </tr>
              ))}
            </tbody>
            {report.detail.length > 0 && (
              <tfoot>
                <tr>
                  <th colSpan={3}>{t("total")}</th>
                  <th className="wp-num">—</th>
                  <th className="wp-num">{money(report.revenue)}</th>
                  <th className="wp-num">{money(report.cogs)}</th>
                  <th />
                  <th className="wp-num">{money(r2(report.detail.reduce((x, d) => x + d.tax, 0)))}</th>
                  <th className="wp-num">{money(report.profit)}</th>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="wp-card">
        <div className="wp-card-header">
          <span className="wp-card-title">
            <Fa name="calendar" /> {t("month_by_month")}
          </span>
          <Badge>{period}</Badge>
        </div>
        <div className="table-responsive">
          <table className="wp-table table-hover table-striped">
            <thead>
              <tr>
                <th>{t("period")}</th>
                <th className="text-right">{t("rep_revenue_ht")}</th>
                <th className="text-right">{t("cogs")}</th>
                <th className="text-right">{t("gross_profit")}</th>
                <th className="text-right">{t("no_cost_recorded")}</th>
                <th className="text-right">{t("tax_collected")}</th>
              </tr>
            </thead>
            <tbody>
              {report.months.map((m) => (
                <tr key={m.key}>
                  <td>{m.label}</td>
                  <td className="wp-num">{money(m.revenue)}</td>
                  <td className="wp-num">{money(m.cogs)}</td>
                  <td className="wp-num">{money(m.profit)}</td>
                  <td className="wp-num">{money(m.uncosted)}</td>
                  <td className="wp-num">{money(m.tax)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th>{t("total")}</th>
                <th className="wp-num">{money(report.revenue)}</th>
                <th className="wp-num">{money(report.cogs)}</th>
                <th className="wp-num">{money(report.profit)}</th>
                <th className="wp-num">{money(report.uncosted)}</th>
                <th className="wp-num">{money(report.tax)}</th>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </ReportShell>
  );
}
