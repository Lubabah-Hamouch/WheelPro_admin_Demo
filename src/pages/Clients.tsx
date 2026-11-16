import { useState, type ReactNode } from "react";
import { useAppUi } from "../appui";
import { useI18n } from "../i18n";
import { clientLabel, type Client } from "../model";
import { clientTotals, useStore } from "../store";
import { Badge, Dialog, Dropdown, Fa, HeaderButtons, Link, MenuItem, orBlank, PageHeader, rowLink, sorted, SortTh, StatusBadge, useSort } from "../ui";
import { balanceLabel } from "./InvoiceView";
import { Missing } from "./Services";

type Tab = "active" | "inactive" | "all";

export function ClientList() {
  const { state, computed, navigate, can, actions, setFlash } = useStore();
  const { t, money } = useI18n();
  const { filter, openCreateInvoice } = useAppUi();
  const [tab, setTab] = useState<Tab>("active");
  const [sort, setSort] = useSort({ key: "name", dir: "asc" });
  const [deleting, setDeleting] = useState<Client | null>(null);
  const needle = filter.trim().toLowerCase();

  const rows = state.clients
    .filter((c) => tab === "all" || (tab === "active" ? c.active : !c.active))
    .filter((c) => !needle || `${clientLabel(c)} ${c.phone} ${c.mobile} ${c.email} ${c.city}`.toLowerCase().includes(needle))
    .map((c) => ({ c, tot: clientTotals(state, computed, c.id) }));
  const list = sorted(rows, sort, ({ c, tot }, k) =>
    k === "active" ? (c.active ? 0 : 1) : k === "email" ? c.email : k === "phone" ? c.phone : k === "count" ? tot.count : k === "billed" ? tot.billed : k === "balance" ? tot.balance : clientLabel(c),
  );

  return (
    <>
      <PageHeader
        title={t("nav_clients")}
        actions={
          <>
            <div className="btn-group btn-group-sm index-options" role="group">
              {(["active", "inactive", "all"] as const).map((x) => (
                <button key={x} type="button" className={`btn ${tab === x ? "btn-primary" : "btn-default"}`} aria-pressed={tab === x} onClick={() => setTab(x)}>
                  {t(x === "active" ? "active" : x === "inactive" ? "inactive" : "all")}
                </button>
              ))}
            </div>
            <Link className="btn btn-sm btn-primary" to="clients/new">
              <Fa name="plus" fw={false} /> {t("new")}
            </Link>
          </>
        }
      />
      <div id="content" className="table-content">
        <div className="table-responsive">
          <table className="wp-table table-hover table-striped">
            <thead>
              <tr>
                <SortTh id="active" label={t("active")} sort={sort} setSort={setSort} />
                <SortTh id="name" label={t("client_name")} sort={sort} setSort={setSort} />
                <SortTh id="email" label={t("email_address")} sort={sort} setSort={setSort} />
                <SortTh id="phone" label={t("phone_number")} sort={sort} setSort={setSort} />
                <SortTh id="count" label={t("invoices_count")} sort={sort} setSort={setSort} amount defaultDir="desc" />
                <SortTh id="billed" label={t("total_billed")} sort={sort} setSort={setSort} amount defaultDir="desc" />
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
              {list.map(({ c, tot }) => (
                <tr key={c.id} {...rowLink(navigate, `clients/${c.id}`)}>
                  <td>
                    <Badge tone={c.active ? "success" : "neutral"}>{c.active ? t("yes") : t("no")}</Badge>
                  </td>
                  <td>
                    <Link to={`clients/${c.id}`}>{clientLabel(c)}</Link>
                  </td>
                  <td>{orBlank(c.email)}</td>
                  <td className="wp-nowrap">{orBlank(c.phone || c.mobile)}</td>
                  <td className="wp-num">{tot.count}</td>
                  <td className="wp-num">{money(tot.billed)}</td>
                  <td className={`wp-num${tot.balance > 0 ? " text-danger" : ""}`}>{money(tot.balance)}</td>
                  <td>
                    <Dropdown
                      right
                      toggle={
                        <>
                          <i className="fa fa-cog" /> {t("options")}
                        </>
                      }
                    >
                      <MenuItem icon="eye" onClick={() => navigate(`clients/${c.id}`)}>
                        {t("view")}
                      </MenuItem>
                      <MenuItem icon="edit" onClick={() => navigate(`clients/${c.id}/edit`)}>
                        {t("edit")}
                      </MenuItem>
                      {c.active && (
                        <MenuItem icon="file-text" onClick={() => openCreateInvoice(c.id)}>
                          {t("create_invoice")}
                        </MenuItem>
                      )}
                      {can("records.delete") && tot.count === 0 && (
                        <MenuItem icon="trash-o" onClick={() => setDeleting(c)}>
                          {t("delete")}
                        </MenuItem>
                      )}
                    </Dropdown>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {deleting && (
        <Dialog
          title={t("confirm_delete_title")}
          text={t("confirm_delete_text", { name: clientLabel(deleting) })}
          confirmLabel={t("delete")}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            actions.deleteClient(deleting.id);
            setFlash({ tone: "success", text: t("record_deleted") });
            setDeleting(null);
          }}
        />
      )}
    </>
  );
}

export function ClientView({ id }: { id: string }) {
  const { state, computed, actions, navigate, setFlash, can, showLoader } = useStore();
  const { t, money, date } = useI18n();
  const { openCreateInvoice } = useAppUi();
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState<"details" | "invoices">("details");
  const client = state.clients.find((c) => c.id === id);
  if (!client) return <Missing back="clients" />;

  const tot = clientTotals(state, computed, id);
  const paid = state.invoices.filter((i) => i.clientId === id && i.issued).reduce((s, i) => s + computed.get(i.id)!.paid, 0);
  const invoices = state.invoices.filter((i) => i.clientId === id).sort((a, b) => (a.date === b.date ? b.seq - a.seq : a.date < b.date ? 1 : -1));
  // A row with nothing in it is dropped, not shown as a column of dashes.
  const contactRows = ([
    [t("email"), client.email ? <a href={`mailto:${client.email}`}>{client.email}</a> : null],
    [t("phone"), client.phone || null],
    [t("mobile"), client.mobile || null],
  ] as [string, ReactNode][]).filter(([, v]) => v);

  return (
    <>
      <PageHeader
        back="clients"
        title={clientLabel(client)}
        extra={
          <>
            {" "}
            <Badge tone={client.active ? "success" : "neutral"}>{client.active ? t("active_one") : t("inactive_one")}</Badge>
          </>
        }
        actions={
          <>
            <div className="btn-group btn-group-sm">
              {client.active && (
                <button type="button" className="btn btn-default client-create-invoice" onClick={() => openCreateInvoice(client.id)}>
                  <Fa name="file-text" fw={false} /> {t("create_invoice")}
                </button>
              )}
              <Link className="btn btn-default" to={`clients/${id}/edit`}>
                <Fa name="edit" fw={false} /> {t("edit")}
              </Link>
            </div>
            <div className="btn-group btn-group-sm">
              <button
                type="button"
                className={`btn ${client.active ? "btn-default" : "btn-success"}`}
                onClick={() => {
                  showLoader();
                  actions.toggleClientActive(id);
                  setFlash({ tone: "success", text: client.active ? t("client_deactivated") : t("client_activated") });
                }}
              >
                <Fa name={client.active ? "pause" : "play"} fw={false} /> {client.active ? t("deactivate") : t("activate")}
              </button>
            </div>
            {can("records.delete") && tot.count === 0 && (
              <div className="btn-group btn-group-sm">
                <button type="button" className="btn btn-danger" onClick={() => setDeleting(true)}>
                  <Fa name="trash-o" fw={false} /> {t("delete")}
                </button>
              </div>
            )}
          </>
        }
      />
      {!client.active && (
        <div className="alert alert-info wp-callout" style={{ margin: "15px 15px 0" }}>
          <Fa name="info-circle" /> <div>{t("client_inactive_note")}</div>
        </div>
      )}
      <ul className="nav nav-tabs nav-tabs-noborder">
        {(["details", "invoices"] as const).map((x) => (
          <li key={x} className={tab === x ? "active" : ""}>
            <a
              href={`#client-${x}`}
              onClick={(e) => {
                e.preventDefault();
                setTab(x);
              }}
            >
              {x === "details" ? t("details") : t("nav_invoices")}
            </a>
          </li>
        ))}
      </ul>
      <div id="content">
        {tab === "details" ? (
          <>
            <div className="row">
              <div className="col-xs-12 col-sm-6 col-md-6 col-lg-8">
                <h3 style={{ marginTop: 0 }}>{clientLabel(client)}</h3>
                <p className="text-muted">
                  {client.address && (
                    <>
                      {client.address}
                      <br />
                    </>
                  )}
                  {[client.zip, client.city].filter(Boolean).join(" ")}
                </p>
              </div>
              <div className="col-xs-12 col-sm-6 col-md-6 col-lg-4">
                <table className="table table-bordered no-margin">
                  <tbody>
                    <tr>
                      <th>{t("total_billed")}</th>
                      <td className="wp-num">{money(tot.billed)}</td>
                    </tr>
                    <tr>
                      <th>{t("total_paid")}</th>
                      <td className="wp-num">{money(paid)}</td>
                    </tr>
                    <tr>
                      <th>{t("total_balance")}</th>
                      <td className={`wp-num${tot.balance > 0 ? " text-danger" : ""}`}>{money(tot.balance)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div className="row" style={{ marginTop: 20 }}>
              <div className="col-xs-12 col-md-6">
                <div className="panel panel-default no-margin">
                  <div className="panel-heading">{t("contact_information")}</div>
                  <div className="panel-body table-content">
                    <table className="table no-margin">
                      <tbody>
                        {contactRows.length === 0 ? (
                          <tr>
                            <td className="wp-empty">—</td>
                          </tr>
                        ) : (
                          contactRows.map(([k, v]) => (
                            <tr key={k}>
                              <th>{k}</th>
                              <td>{v}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <div className="col-xs-12 col-md-6">
                <div className="panel panel-default no-margin">
                  <div className="panel-heading">{t("tax_information")}</div>
                  <div className="panel-body table-content">
                    <table className="table no-margin">
                      <tbody>
                        <tr>
                          <th>{t("ice_number")}</th>
                          <td>{orBlank(client.ice)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : invoices.length === 0 ? (
          <div className="wp-dash-empty">{t("client_no_invoices")}</div>
        ) : (
          <div className="table-responsive">
            <table className="wp-table table-hover table-striped">
              <thead>
                <tr>
                  <th>{t("status")}</th>
                  <th>{t("invoice")}</th>
                  <th>{t("created")}</th>
                  <th>{t("due_date")}</th>
                  <th className="text-right">{t("amount")}</th>
                  <th className="text-right">{t("balance")}</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => {
                  const c = computed.get(inv.id)!;
                  return (
                    <tr key={inv.id} {...rowLink(navigate, `invoices/${inv.id}`)}>
                      <td className="wp-nowrap">
                        <StatusBadge c={c} />
                      </td>
                      <td>
                        <Link to={`invoices/${inv.id}`}>{inv.number || <span className="text-muted">{t("wp_draft")}</span>}</Link>
                      </td>
                      <td>{date(inv.date)}</td>
                      <td>
                        <span className={c.overdue ? "font-overdue" : ""}>{date(inv.due)}</span>
                      </td>
                      <td className={`wp-num${inv.creditParentId ? " text-danger" : ""}`}>{money(c.total)}</td>
                      <td className="wp-num">{balanceLabel(c, money, t)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {deleting && (
        <Dialog
          title={t("confirm_delete_title")}
          text={t("confirm_delete_text", { name: clientLabel(client) })}
          confirmLabel={t("delete")}
          onCancel={() => setDeleting(false)}
          onConfirm={() => {
            actions.deleteClient(id);
            setFlash({ tone: "success", text: t("record_deleted") });
            navigate("clients", true);
          }}
        />
      )}
    </>
  );
}

const blankClient = (): Client => ({ id: "", name: "", surname: "", phone: "", mobile: "", email: "", address: "", zip: "", city: "", ice: "", active: true });

export function ClientForm({ id }: { id: string | null }) {
  const { state, actions, navigate, setFlash, dirty, showLoader } = useStore();
  const { t } = useI18n();
  const existing = id ? state.clients.find((c) => c.id === id) : undefined;
  const [f, setF] = useState<Client>(() => existing ?? blankClient());
  const [nameError, setNameError] = useState(false);
  if (id && !existing) return <Missing back="clients" />;

  const set = (patch: Partial<Client>) => {
    dirty.current = true;
    setF((x) => ({ ...x, ...patch }));
  };
  const back = existing ? `clients/${existing.id}` : "clients";
  const text = (key: "name" | "surname" | "address" | "zip" | "city" | "phone" | "mobile" | "email" | "ice", label: string, type = "text") => (
    <div className={`form-group${key === "name" && nameError ? " has-error" : ""}`}>
      <label htmlFor={`client_${key}`}>{label}</label>
      <input id={`client_${key}`} type={type} className="form-control" value={f[key]} onChange={(e) => set({ [key]: e.target.value } as Partial<Client>)} />
    </div>
  );

  return (
    <form
      id="client-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setFlash(null);
        // The name is the one required field.
        if (!f.name.trim()) {
          setNameError(true);
          window.scrollTo({ top: 0 });
          return;
        }
        // A new client with exactly the same name and surname as one on file is refused.
        if (!existing && state.clients.some((c) => c.name === f.name.trim() && c.surname === f.surname.trim())) {
          setFlash({ tone: "danger", text: t("client_already_exists") });
          setF(blankClient());
          dirty.current = false;
          window.scrollTo({ top: 0 });
          return;
        }
        dirty.current = false;
        showLoader();
        const newId = actions.saveClient({ ...f, name: f.name.trim(), surname: f.surname.trim() });
        setFlash({ tone: "success", text: existing ? t("record_updated") : t("record_created") });
        navigate(`clients/${newId}`, true);
      }}
    >
      <PageHeader back={back} title={t("client_form")} actions={<HeaderButtons form="client-form" cancelTo={back} />} />
      <div id="content">
        {nameError && <div className="alert alert-danger">{t("field_required", { field: t("client_name") })}</div>}
        <div className="row">
          <div className="col-xs-12 col-sm-6">
            <div className="panel panel-default">
              <div className="panel-heading form-inline clearfix">
                <span>{t("personal_information")}</span>
                <div className="checkbox">
                  <label>
                    <input type="checkbox" checked={f.active} onChange={(e) => set({ active: e.target.checked })} /> {t("active_one")}
                  </label>
                </div>
              </div>
              <div className="panel-body">
                {text("name", `${t("client_name")} *`)}
                {text("surname", t("client_surname_optional"))}
              </div>
            </div>
          </div>
          <div className="col-xs-12 col-sm-6">
            <div className="panel panel-default">
              <div className="panel-heading">{t("address")}</div>
              <div className="panel-body">
                {text("address", t("street_address"))}
                {text("city", t("city"))}
                {text("zip", t("zip_code"))}
              </div>
            </div>
          </div>
          <div className="col-xs-12 col-sm-6">
            <div className="panel panel-default">
              <div className="panel-heading">{t("contact_information")}</div>
              <div className="panel-body">
                {text("phone", t("phone_number"))}
                {text("mobile", t("mobile_number"))}
                {text("email", t("email_address"), "email")}
                <p className="help-block" style={{ marginBottom: 0 }}>
                  {t("demo_contact_note")}
                </p>
              </div>
            </div>
          </div>
          <div className="col-xs-12 col-sm-6">
            <div className="panel panel-default">
              <div className="panel-heading">{t("tax_information")}</div>
              <div className="panel-body">{text("ice", t("ice_number"))}</div>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
