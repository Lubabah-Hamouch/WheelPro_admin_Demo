import { useEffect, useMemo, useState } from "react";
import { creditDue, inRange, isOpen, presetRange, r2, type Preset, type Range } from "../calc";
import { useAppUi } from "../appui";
import { useI18n } from "../i18n";
import { clientLabel, findProduct } from "../model";
import { useStore } from "../store";
import { Badge, Fa, Link, PageHeader, StatusBadge } from "../ui";

const REFRESH_INTERVAL = 60;

export function Dashboard() {
  const { state, computed, can } = useStore();
  const { t, money, date, pname } = useI18n();
  const { openCreateInvoice } = useAppUi();
  const canRevenue = can("reports.sales");
  const [preset, setPreset] = useState<Preset>("month");
  const [range, setRange] = useState<Range>(() => presetRange("month", state.today));
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL);
  const [spinning, setSpinning] = useState(false);
  // The widgets show their loading state until the first "fetch" lands, as the real ones do.
  const [loaded, setLoaded] = useState(false);

  const refresh = () => {
    setSpinning(true);
    setCountdown(REFRESH_INTERVAL);
    window.setTimeout(() => setSpinning(false), 600);
  };

  useEffect(() => {
    const id = window.setTimeout(() => setLoaded(true), 550);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          refresh();
          return REFRESH_INTERVAL;
        }
        return c - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const issued = useMemo(() => state.invoices.filter((i) => i.issued), [state.invoices]);

  const stats = useMemo(() => {
    const month = presetRange("month", state.today);
    let revenueMonth = 0;
    let outstanding = 0;
    for (const inv of issued) {
      const c = computed.get(inv.id)!;
      for (const p of inv.payments) if (inRange(p.date, month)) revenueMonth += p.amount;
      if (isOpen(c)) outstanding += c.balance;
    }
    return {
      invoices: issued.length,
      clients: state.clients.filter((c) => c.active).length,
      revenueMonth: r2(revenueMonth),
      outstanding: r2(outstanding),
    };
  }, [issued, computed, state]);

  // Invoiced by invoice date, collected by payment date (cash basis), outstanding on the period's invoices.
  const revenue = useMemo(() => {
    let invoiced = 0;
    let collected = 0;
    let outstanding = 0;
    const sellers = new Map<string, { id: string | null; name: string; ref: string; qty: number; revenue: number }>();
    for (const inv of issued) {
      const c = computed.get(inv.id)!;
      for (const p of inv.payments) if (inRange(p.date, range)) collected += p.amount;
      if (!inRange(inv.date, range)) continue;
      invoiced += c.total;
      if (isOpen(c)) outstanding += c.balance;
      for (const l of c.lines) {
        const prod = findProduct(state, l.line.productId);
        const k = prod ? prod.id : `custom:${l.line.name}`;
        const row = sellers.get(k) ?? { id: prod?.id ?? null, name: l.line.name, ref: prod?.ref ?? "", qty: 0, revenue: 0 };
        row.qty += l.qty;
        row.revenue = r2(row.revenue + l.revenue);
        sellers.set(k, row);
      }
    }
    const best = [...sellers.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue).slice(0, 10);
    return { invoiced: r2(invoiced), collected: r2(collected), outstanding: r2(outstanding), best };
  }, [issued, computed, range, state]);

  const share = revenue.collected / (revenue.collected + revenue.outstanding || 1);
  const recent = [...state.invoices].sort((a, b) => (a.date === b.date ? b.seq - a.seq : a.date < b.date ? 1 : -1)).slice(0, 8);
  const followups = issued
    .map((inv) => ({ inv, c: computed.get(inv.id)! }))
    .filter(({ c }) => isOpen(c) && c.balance > 0)
    .sort((a, b) => (a.inv.due < b.inv.due ? -1 : 1))
    .slice(0, 10);
  const lowStock = state.parts.filter((p) => p.qty <= p.threshold).sort((a, b) => a.qty - b.qty);
  const clientName = (id: string) => clientLabel(state.clients.find((c) => c.id === id));

  return (
    <>
      <PageHeader
        title={t("nav_dashboard")}
        sub={date(state.today, "long")}
        actions={
          <>
            <span className="wp-dash-ticker">{t("refresh_in", { n: countdown })}</span>
            <button type="button" className="btn btn-sm btn-default" onClick={refresh} disabled={spinning}>
              <Fa name="refresh" fw={false} spin={spinning} /> {t("refresh")}
            </button>
          </>
        }
      />
      <div id="content">
        <div className="wp-dash-stats">
          <Stat icon="file-text" tone="blue" label={t("total_invoices")} value={loaded ? String(stats.invoices) : null} />
          <Stat icon="users" tone="purple" label={t("active_clients")} value={loaded ? String(stats.clients) : null} />
          {canRevenue && <Stat icon="money" tone="green" label={t("revenue_month")} value={loaded ? money(stats.revenueMonth) : null} money />}
          <Stat icon="warning" tone="orange" label={t("outstanding_all")} value={loaded ? money(stats.outstanding) : null} money />
        </div>

        {canRevenue && (
          <div className="wp-card">
            <div className="wp-card-header">
              <span className="wp-card-title">{t("revenue")}</span>
              <span className="wp-badge">
                {date(range.from)} → {date(range.to)}
              </span>
            </div>
            <div className="wp-dash-range">
              {(["today", "week", "month", "year"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`wp-dash-range-btn${preset === k ? " is-active" : ""}`}
                  onClick={() => {
                    setPreset(k);
                    setRange(presetRange(k, state.today));
                  }}
                >
                  {t(`preset_${k}`)}
                </button>
              ))}
              <span className="wp-dash-range-custom">
                <input
                  type="date"
                  aria-label={t("from_date")}
                  value={range.from}
                  max={range.to}
                  onChange={(e) => e.target.value && (setPreset("custom"), setRange((r) => ({ ...r, from: e.target.value })))}
                />
                <span>→</span>
                <input
                  type="date"
                  aria-label={t("to_date")}
                  value={range.to}
                  min={range.from}
                  onChange={(e) => e.target.value && (setPreset("custom"), setRange((r) => ({ ...r, to: e.target.value })))}
                />
              </span>
            </div>
            {!loaded ? (
              <div className="wp-dash-empty">{t("loading")}</div>
            ) : (
            <>
            <div className="wp-dash-rev">
              <div className="wp-dash-rev-cell">
                <div className="wp-stat-label">{t("invoiced")}</div>
                <div className="wp-dash-rev-value">{money(revenue.invoiced)}</div>
                <div className="wp-stat-sub">{t("invoiced_sub")}</div>
              </div>
              <div className="wp-dash-rev-cell">
                <div className="wp-stat-label">{t("collected")}</div>
                <div className="wp-dash-rev-value green">{money(revenue.collected)}</div>
                <div className="wp-stat-sub">{t("collected_sub")}</div>
              </div>
              <div className="wp-dash-rev-cell">
                <div className="wp-stat-label">{t("outstanding")}</div>
                <div className="wp-dash-rev-value orange">{money(revenue.outstanding)}</div>
                <div className="wp-stat-sub">{t("outstanding_sub")}</div>
              </div>
            </div>
            {revenue.collected + revenue.outstanding > 0 && (
              <div className="wp-dash-split">
                <div className="wp-dash-split-bar">
                  <div className="wp-dash-split-paid" style={{ width: `${share * 100}%` }} />
                </div>
                <div className="wp-dash-split-legend">
                  <span>
                    <i className="wp-dash-dot green" /> {t("collected")} {Math.round(share * 100)}%
                  </span>
                  <span>
                    <i className="wp-dash-dot orange" /> {t("outstanding")} {Math.round((1 - share) * 100)}%
                  </span>
                </div>
              </div>
            )}
            <div className="wp-dash-subhead">{t("best_sellers")}</div>
            {revenue.best.length === 0 ? (
              <div className="wp-dash-empty">{t("no_sales")}</div>
            ) : (
              <div className="table-responsive">
                <table className="wp-table">
                  <thead>
                    <tr>
                      <th>{t("service_part")}</th>
                      <th>{t("ref")}</th>
                      <th className="text-right">{t("qty")}</th>
                      <th className="text-right">{t("revenue_ht")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenue.best.map((b) => (
                      <tr key={b.id ?? b.name}>
                        <td className="wp-dash-strong">{b.id ? pname(findProduct(state, b.id)!) : b.name}</td>
                        <td>{b.ref || "—"}</td>
                        <td className="text-right">{b.qty}</td>
                        <td className="text-right">{money(b.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            </>
            )}
          </div>
        )}

        <div className="wp-card">
          <div className="wp-card-header">
            <span className="wp-card-title">{t("recent_invoices")}</span>
            {loaded && <span className="wp-badge">{t("shown", { n: recent.length })}</span>}
          </div>
          {!loaded ? (
            <div className="wp-dash-empty">{t("loading")}</div>
          ) : recent.length === 0 ? (
            <div className="wp-dash-empty">
              {t("no_invoices_yet")}{" "}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  openCreateInvoice();
                }}
              >
                {t("create_one")}
              </a>
            </div>
          ) : (
          <div className="table-responsive">
            <table className="wp-table">
              <thead>
                <tr>
                  <th>{t("invoice_no")}</th>
                  <th>{t("client")}</th>
                  <th>{t("amount")}</th>
                  <th>{t("balance")}</th>
                  <th>{t("status")}</th>
                  <th>{t("date")}</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((inv) => {
                  const c = computed.get(inv.id)!;
                  const credit = creditDue(c);
                  return (
                    <tr key={inv.id}>
                      <td>
                        <Link className="wp-dash-link" to={`invoices/${inv.id}`}>
                          {inv.number || t("wp_draft")}
                        </Link>
                      </td>
                      <td className="wp-dash-strong">{clientName(inv.clientId)}</td>
                      <td className="wp-dash-num">{money(c.total)}</td>
                      <td className={`wp-dash-num ${c.balance > 0 ? "is-owed" : "is-settled"}`}>
                        {credit === null ? money(c.balance) : t("credit_amount", { amount: money(credit) })}
                      </td>
                      <td>
                        <StatusBadge c={c} />
                      </td>
                      <td className="wp-dash-muted">{date(inv.date)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
        </div>

        <div className="wp-card">
          <div className="wp-card-header">
            <span className="wp-card-title">{t("followups")}</span>
            {loaded && (
              <span className={`wp-badge ${followups.some((f) => f.c.overdue) ? "wp-badge--overdue" : "wp-badge--neutral"}`}>
                {t("shown", { n: followups.length })}
              </span>
            )}
          </div>
          {!loaded ? (
            <div className="wp-dash-empty">{t("loading")}</div>
          ) : followups.length === 0 ? (
            <div className="wp-dash-empty is-ok">✓ {t("nothing_to_chase")}</div>
          ) : (
            <div className="table-responsive">
              <table className="wp-table">
                <thead>
                  <tr>
                    <th>{t("invoice_no")}</th>
                    <th>{t("client")}</th>
                    <th>{t("due_date")}</th>
                    <th>{t("balance")}</th>
                  </tr>
                </thead>
                <tbody>
                  {followups.map(({ inv, c }) => (
                    <tr key={inv.id}>
                      <td>
                        <Link className="wp-dash-link" to={`invoices/${inv.id}`}>
                          {inv.number}
                        </Link>
                      </td>
                      <td className="wp-dash-strong">{clientName(inv.clientId)}</td>
                      <td className="wp-dash-muted">
                        {date(inv.due)}
                        {c.overdue && (
                          <>
                            {" "}
                            <Badge tone="overdue">{t("days_overdue", { n: c.daysOverdue })}</Badge>
                          </>
                        )}
                      </td>
                      <td className="wp-dash-num is-owed">{money(c.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="wp-card">
          <div className="wp-card-header">
            <span className="wp-card-title">{t("low_stock")}</span>
            {loaded && (
              <span className={`wp-badge ${lowStock.length > 0 ? "wp-badge--danger" : "wp-badge--neutral"}`}>
                {lowStock.length} {lowStock.length === 1 ? t("item") : t("items")}
              </span>
            )}
          </div>
          {!loaded ? (
            <div className="wp-dash-empty">{t("loading")}</div>
          ) : lowStock.length === 0 ? (
            <div className="wp-dash-empty is-ok">✓ {t("all_stocked")}</div>
          ) : (
            lowStock.map((p) => (
              <Link className="wp-dash-stock" key={p.id} to={`stock/${p.id}/history`}>
                <div>
                  <div className="wp-dash-stock-name">{pname(p)}</div>
                  <div className="wp-dash-stock-meta">
                    {p.ref || "—"} · {p.supplier || t("no_supplier")}
                  </div>
                </div>
                <div className="text-right">
                  <div className="wp-dash-stock-qty">{p.qty}</div>
                  <div className="wp-dash-stock-meta">{t("threshold", { n: p.threshold })}</div>
                </div>
              </Link>
            ))
          )}
        </div>

        <div className="wp-card">
          <div className="wp-card-header">
            <span className="wp-card-title">{t("quick_links")}</span>
          </div>
          <div className="wp-dash-quick">
            <button type="button" className="btn btn-primary" onClick={() => openCreateInvoice()}>
              <Fa name="plus" /> {t("new_invoice")}
            </button>
            <Link className="btn btn-primary" to="clients/new">
              <Fa name="plus" /> {t("new_client")}
            </Link>
            <Link className="btn btn-default" to="clients">
              <Fa name="users" /> {t("nav_clients")}
            </Link>
            <Link className="btn btn-default" to="stock">
              <Fa name="cubes" /> {t("nav_stock")}
            </Link>
            {canRevenue && (
              <Link className="btn btn-default" to="settings">
                <Fa name="cogs" /> {t("nav_settings")}
              </Link>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function Stat({ icon, tone, label, value, money }: { icon: string; tone: string; label: string; value: string | null; money?: boolean }) {
  return (
    <div className="wp-card wp-card--stat">
      <div className={`wp-dash-stat-icon ${tone}`}>
        <Fa name={icon} />
      </div>
      <div className="wp-stat-label">{label}</div>
      {value === null ? <div className="wp-dash-skeleton" /> : <div className={`wp-stat-value${money ? " wp-stat-value--money" : ""}`}>{value}</div>}
    </div>
  );
}
