import { useState } from "react";
import { useAppUi } from "../appui";
import { type Computed, type Invoice } from "../calc";
import { useI18n } from "../i18n";
import { clientLabel, isReadOnly } from "../model";
import { useStore } from "../store";
import { balanceLabel, PaymentModal } from "./InvoiceView";
import { Dialog, DocLink, Dropdown, Fa, Link, MenuItem, PageHeader, rowLink, sorted, SortTh, StatusBadge, useSort } from "../ui";

const STATUSES = ["all", "draft", "unpaid", "partial", "paid", "overdue"] as const;
type StatusFilter = (typeof STATUSES)[number];

export function InvoiceList() {
  const { state, computed, can, route, navigate, actions, setFlash } = useStore();
  const { t, money, date, statusLabel } = useI18n();
  const { filter, openCreateInvoice } = useAppUi();
  const q = route.query;
  const [status, setStatus] = useState<StatusFilter>(() => (STATUSES as readonly string[]).includes(q.get("status") ?? "") ? (q.get("status") as StatusFilter) : "all");
  const [client, setClient] = useState(q.get("client") ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useSort({ key: "date", dir: "desc" });
  const [deleting, setDeleting] = useState<Invoice | null>(null);
  const [paying, setPaying] = useState<Invoice | null>(null);

  const clientName = (id: string) => clientLabel(state.clients.find((c) => c.id === id));
  const needle = filter.trim().toLowerCase();

  const matchStatus = (c: Computed) => status === "all" || (status === "overdue" ? c.overdue : c.status === status);
  const rows = state.invoices
    .map((inv) => ({ inv, c: computed.get(inv.id)! }))
    .filter(({ c }) => matchStatus(c))
    .filter(({ inv }) => !client || inv.clientId === client)
    .filter(({ inv }) => (!from || inv.date >= from) && (!to || inv.date <= to))
    .filter(({ inv }) => !needle || `${inv.number ?? ""} ${clientName(inv.clientId)} ${inv.vehicle}`.toLowerCase().includes(needle));

  const order = { draft: 0, unpaid: 1, partial: 2, paid: 3 };
  const list = sorted(rows, sort, ({ inv, c }, k) => {
    switch (k) {
      case "status":
        return order[c.status];
      case "number":
        return inv.number ?? "";
      case "due":
        return inv.due;
      case "client":
        return clientName(inv.clientId);
      case "amount":
        return c.total;
      case "balance":
        return c.balance;
      default:
        return `${inv.date}|${String(inv.seq).padStart(5, "0")}`;
    }
  });

  const filtered = !!client || !!from || !!to || !!needle;

  return (
    <>
      <PageHeader
        title={t("nav_invoices")}
        actions={
          <>
            <div className="btn-group btn-group-sm" role="group" aria-label={t("status")}>
              {STATUSES.map((s) => (
                <button key={s} type="button" className={`btn ${status === s ? "btn-primary" : "btn-default"}`} aria-pressed={status === s} onClick={() => setStatus(s)}>
                  {s === "all" ? t("all") : s === "overdue" ? t("overdue") : statusLabel(s)}
                </button>
              ))}
            </div>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => openCreateInvoice()}>
              <Fa name="plus" fw={false} /> {t("new")}
            </button>
          </>
        }
      />
      <div className="wp-card wp-report-filter" style={{ margin: 15 }}>
        <div className="wp-card-body">
          <div className="wp-report-period">
            <div className="form-group">
              <label htmlFor="if-client">{t("client")}</label>
              <select id="if-client" className="form-control" value={client} onChange={(e) => setClient(e.target.value)}>
                <option value="">{t("all_clients")}</option>
                {[...state.clients]
                  .sort((a, b) => a.name.localeCompare(b.name, "fr"))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {clientLabel(c)}
                      {c.active ? "" : ` (${t("inactive")})`}
                    </option>
                  ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="if-from">{t("from_date")}</label>
              <input id="if-from" type="date" className="form-control" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="if-to">{t("to_date")}</label>
              <input id="if-to" type="date" className="form-control" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
            </div>
            {filtered && (
              <div className="form-group">
                <button
                  type="button"
                  className="btn btn-default"
                  onClick={() => {
                    setClient("");
                    setFrom("");
                    setTo("");
                  }}
                >
                  <Fa name="times" fw={false} /> {t("clear_filters")}
                </button>
              </div>
            )}
          </div>
          <div className="wp-dash-muted">{t("n_invoices", { n: list.length })}</div>
        </div>
      </div>
      <div id="content" className="table-content">
        <div className="table-responsive">
          <table className="wp-table table-hover table-striped">
            <thead>
              <tr>
                <SortTh id="status" label={t("status")} sort={sort} setSort={setSort} />
                <SortTh id="number" label={t("invoice")} sort={sort} setSort={setSort} />
                <SortTh id="date" label={t("created")} sort={sort} setSort={setSort} defaultDir="desc" />
                <SortTh id="due" label={t("due_date")} sort={sort} setSort={setSort} />
                <SortTh id="client" label={t("client_name")} sort={sort} setSort={setSort} />
                <SortTh id="amount" label={t("amount")} sort={sort} setSort={setSort} amount defaultDir="desc" />
                <SortTh id="balance" label={t("balance")} sort={sort} setSort={setSort} amount defaultDir="desc" />
                <th>{t("options")}</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center wp-dash-muted">
                    {t("no_results")}
                  </td>
                </tr>
              )}
              {list.map(({ inv, c }) => {
                const locked = isReadOnly(c.status, state.settings.readOnlyFrom, inv.locked);
                return (
                  <tr key={inv.id} {...rowLink(navigate, `invoices/${inv.id}`)}>
                    <td className="wp-nowrap">
                      <StatusBadge c={c} />
                    </td>
                    <td>
                      <Link to={`invoices/${inv.id}`} title={t("edit")}>
                        {inv.number || <span className="text-muted">{t("wp_draft")}</span>}
                      </Link>
                    </td>
                    <td className="wp-nowrap">{date(inv.date)}</td>
                    <td className="wp-nowrap">
                      <span className={c.overdue ? "font-overdue" : ""}>{date(inv.due)}</span>
                    </td>
                    <td>
                      <Link to={`clients/${inv.clientId}`}>{clientName(inv.clientId)}</Link>
                    </td>
                    <td className={`wp-num${inv.creditParentId ? " text-danger" : ""}`}>{money(c.total)}</td>
                    <td className="wp-num">{balanceLabel(c, money, t)}</td>
                    <td>
                      <Dropdown
                        right
                        toggle={
                          <>
                            <i className="fa fa-cog" /> {t("options")}
                          </>
                        }
                      >
                        {!locked && (
                          <MenuItem icon="edit" onClick={() => navigate(`invoices/${inv.id}`)}>
                            {t("edit")}
                          </MenuItem>
                        )}
                        <li>
                          <DocLink to={`invoices/${inv.id}/facture`}>
                            <i className="fa fa-print fa-margin" /> {t("download_pdf")}
                          </DocLink>
                        </li>
                        <MenuItem icon="money" onClick={() => setPaying(inv)}>
                          {t("enter_payment")}
                        </MenuItem>
                        {!inv.issued && can("records.delete") && (
                          <MenuItem icon="trash-o" onClick={() => setDeleting(inv)}>
                            {t("delete")}
                          </MenuItem>
                        )}
                      </Dropdown>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {deleting && (
        <Dialog
          title={t("confirm_delete_title")}
          text={t("confirm_delete_text", { name: deleting.number || t("wp_draft") })}
          confirmLabel={t("delete")}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            actions.deleteInvoice(deleting.id);
            setFlash({ tone: "success", text: t("record_deleted") });
            setDeleting(null);
          }}
        />
      )}
      {paying && <PaymentModal invoice={paying} c={computed.get(paying.id)!} full={false} onClose={() => setPaying(null)} />}
    </>
  );
}
