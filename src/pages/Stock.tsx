import { useState } from "react";
import { useAppUi } from "../appui";
import { parse } from "../calc";
import { useI18n } from "../i18n";
import type { Movement, Part } from "../model";
import { score, THRESHOLD } from "../similar";
import { useStore } from "../store";
import { Dialog, Dropdown, Fa, HeaderButtons, Link, MenuItem, orBlank, PageHeader, rowLink, sorted, SortTh, useSort } from "../ui";
import { Missing } from "./Services";

const REASON_CLASS: Record<Movement["reason"], string> = {
  sale: "label-info",
  credit: "label-success",
  sale_edit: "label-warning",
  sale_void: "label-default",
  adjust: "label-primary",
  edit: "label-primary",
  initial: "label-success",
};

export function StockList() {
  const { state, navigate, actions, setFlash, can } = useStore();
  const { t, money, pname } = useI18n();
  const { filter } = useAppUi();
  const [sort, setSort] = useSort({ key: "name", dir: "asc" });
  const [deleting, setDeleting] = useState<Part | null>(null);
  const needle = filter.trim().toLowerCase();

  const rows = state.parts.filter((p) => !needle || `${p.nameFr} ${p.nameEn} ${p.ref} ${p.supplier}`.toLowerCase().includes(needle));
  const list = sorted(rows, sort, (p, k) => (k === "ref" ? p.ref : k === "supplier" ? p.supplier : k === "stock" ? p.qty : k === "price" ? p.price : pname(p)));
  const low = state.parts.filter((p) => p.qty <= p.threshold).length;

  return (
    <>
      <PageHeader
        title={t("nav_stock")}
        sub={low ? t("n_low", { n: low }) : undefined}
        actions={
          <>
            <Link className="btn btn-sm btn-default" to="stock/all/history">
              <Fa name="history" fw={false} /> {t("all_movements")}
            </Link>
            <Link className="btn btn-sm btn-primary" to="stock/new">
              <Fa name="plus" fw={false} /> {t("add_part")}
            </Link>
          </>
        }
      />
      <div id="content" className="table-content">
        <div className="table-responsive">
          <table className="wp-table table-hover table-striped">
            <thead>
              <tr>
                <SortTh id="name" label={t("part_name")} sort={sort} setSort={setSort} />
                <SortTh id="ref" label={t("reference")} sort={sort} setSort={setSort} />
                <SortTh id="supplier" label={t("supplier")} sort={sort} setSort={setSort} />
                <SortTh id="stock" label={t("stock_column")} sort={sort} setSort={setSort} amount />
                <SortTh id="price" label={t("unit_price")} sort={sort} setSort={setSort} amount />
                <th className="text-center">{t("adjust")}</th>
                <th className="text-center">{t("actions")}</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center">
                    {needle ? (
                      t("no_results")
                    ) : (
                      <>
                        {t("no_parts")} <Link to="stock/new">{t("add_first_part")}</Link>
                      </>
                    )}
                  </td>
                </tr>
              )}
              {list.map((p) => {
                const isLow = p.qty <= p.threshold;
                return (
                  <tr key={p.id} className={isLow ? "wp-row-danger" : undefined} {...rowLink(navigate, `stock/${p.id}`)}>
                    <td>
                      <span className="wp-dash-strong">{pname(p)}</span>{" "}
                      {p.qty < 0 ? <span className="label label-danger">{t("oversold")}</span> : isLow && <span className="label label-danger">{t("low_stock_badge")}</span>}
                    </td>
                    <td>{orBlank(p.ref)}</td>
                    <td>{orBlank(p.supplier)}</td>
                    <td className={`wp-num${p.qty < 0 ? " text-danger" : ""}`}>
                      <strong>{p.qty}</strong>
                    </td>
                    <td className="wp-num">{money(p.price)}</td>
                    <td className="text-center wp-nowrap">
                      <button type="button" className="btn btn-xs btn-success" data-tip={t("add_one")} aria-label={t("add_one")} onClick={() => actions.adjustPart(p.id, 1)}>
                        <i className="fa fa-plus" />
                      </button>{" "}
                      <button type="button" className="btn btn-xs btn-warning" data-tip={t("remove_one")} aria-label={t("remove_one")} onClick={() => actions.adjustPart(p.id, -1)}>
                        <i className="fa fa-minus" />
                      </button>
                    </td>
                    <td className="text-center">
                      <Dropdown right toggleClass="btn btn-xs dropdown-toggle" toggle={<><i className="fa fa-cog" /> <span className="caret" /></>}>
                        <MenuItem icon="pencil" onClick={() => navigate(`stock/${p.id}`)}>
                          {t("edit")}
                        </MenuItem>
                        <MenuItem icon="history" onClick={() => navigate(`stock/${p.id}/history`)}>
                          {t("stock_history")}
                        </MenuItem>
                        <li className="divider" />
                        {can("records.delete") && (
                          <>
                            <MenuItem icon="trash" danger onClick={() => setDeleting(p)}>
                              {t("delete")}
                            </MenuItem>
                          </>
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
          text={t("confirm_delete_part", { name: pname(deleting) })}
          confirmLabel={t("delete")}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            actions.deletePart(deleting.id);
            setFlash({ tone: "success", text: t("deleted", { name: pname(deleting) }) });
            setDeleting(null);
          }}
        />
      )}
    </>
  );
}

/** One page for one part's history, or (id "all") every movement in the shop. */
export function StockHistory({ id }: { id: string }) {
  const { state } = useStore();
  const { t, pname, dateTime, roleLabel } = useI18n();
  const all = id === "all";
  const part = all ? undefined : state.parts.find((p) => p.id === id);
  if (!all && !part) return <Missing back="stock" />;

  const rows = state.movements.filter((m) => all || m.partId === id).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const invoice = (invId: string | null) => (invId ? state.invoices.find((i) => i.id === invId) : undefined);
  const partOf = (pid: string) => state.parts.find((p) => p.id === pid);

  return (
    <>
      <PageHeader
        back="stock"
        title={all ? t("stock_history") : `${t("stock_history")} — ${pname(part!)}`}
        actions={
          <Link className="btn btn-default" to="stock">
            <Fa name="arrow-left" fw={false} /> {t("back_to_inventory")}
          </Link>
        }
      />
      <div id="content" className="table-content">
        {part && (
          <div className="panel panel-default" style={{ margin: 15 }}>
            <div className="panel-body">
              <strong>{t("current_stock")}:</strong> <span className={part.qty < 0 ? "text-danger" : ""}>{part.qty}</span>
              &nbsp;·&nbsp;<strong>{t("low_stock_threshold")}:</strong> {part.threshold}
              {part.ref && (
                <>
                  &nbsp;·&nbsp;<strong>{t("reference")}:</strong> {part.ref}
                </>
              )}
              {part.qty < 0 && (
                <>
                  {" "}
                  <span className="label label-danger">{t("oversold")}</span>
                </>
              )}
            </div>
          </div>
        )}
        <div className="table-responsive">
          <table className="wp-table">
            <thead>
              <tr>
                <th>{t("when")}</th>
                {all && <th>{t("part_name")}</th>}
                <th>{t("reason")}</th>
                <th>{t("invoice")}</th>
                <th className="text-right">{t("change")}</th>
                <th className="text-right">{t("balance_after")}</th>
                <th>{t("by")}</th>
                <th>{t("note")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center wp-dash-muted">
                    {t("no_movements")}
                  </td>
                </tr>
              )}
              {rows.map((m) => {
                const inv = invoice(m.invoiceId);
                const p = partOf(m.partId);
                return (
                  <tr key={m.id}>
                    <td className="wp-nowrap">{dateTime(m.at)}</td>
                    {all && <td>{p ? <Link to={`stock/${p.id}/history`}>{pname(p)}</Link> : "—"}</td>}
                    <td>
                      <span className={`label ${REASON_CLASS[m.reason]}`}>{t(`reason_${m.reason}`)}</span>
                    </td>
                    <td>{inv ? <Link to={`invoices/${inv.id}`}>{inv.number || t("wp_draft")}</Link> : m.invoiceId ? <span className="text-muted">({t("deleted_short")})</span> : ""}</td>
                    <td className={`wp-num ${m.change < 0 ? "text-danger" : "text-success"}`}>
                      {m.change > 0 ? "+" : ""}
                      {m.change}
                    </td>
                    <td className={`wp-num${m.balance < 0 ? " text-danger" : ""}`}>{m.balance}</td>
                    <td>{roleLabel(m.by)}</td>
                    <td className="text-muted">{m.reason === "initial" ? "Opening stock" : ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

const code = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function PartForm({ id }: { id: string | null }) {
  const { state, can, actions, navigate, setFlash, dirty, showLoader } = useStore();
  const { t, pname } = useI18n();
  const existing = id ? state.parts.find((p) => p.id === id) : undefined;
  const [f, setF] = useState(() => ({
    nameFr: existing?.nameFr ?? "",
    nameEn: existing?.nameEn ?? "",
    ref: existing?.ref ?? "",
    supplier: existing?.supplier ?? "",
    price: existing ? existing.price.toFixed(2) : "",
    cost: existing?.cost != null ? existing.cost.toFixed(2) : "",
    qty: existing ? String(existing.qty) : "0",
    threshold: existing ? String(existing.threshold) : "3",
    taxId: existing?.taxId ?? state.settings.defaultTaxId,
  }));
  const [dup, setDup] = useState<{ part: Part; why: "name" | "ref" | "both" } | null>(null);
  if (id && !existing) return <Missing back="stock" />;
  const admin = can("inventory.cost");

  const set = (patch: Partial<typeof f>) => {
    dirty.current = true;
    setF((x) => ({ ...x, ...patch }));
  };

  const save = () => {
    dirty.current = false;
    showLoader();
    actions.savePart({
      id: existing?.id ?? "",
      nameFr: f.nameFr.trim(),
      nameEn: f.nameEn.trim(),
      ref: f.ref.trim(),
      supplier: f.supplier.trim(),
      price: parse(f.price),
      cost: f.cost.trim() === "" ? null : parse(f.cost),
      qty: Math.round(parse(f.qty)),
      threshold: Math.max(0, Math.round(parse(f.threshold))),
      taxId: f.taxId,
    });
    setFlash({ tone: "success", text: existing ? t("record_updated") : t("record_created") });
    navigate("stock", true);
  };

  const trySave = () => {
    if (!f.nameFr.trim()) return;
    if (!existing) {
      // A reference match is exact (separators ignored), a name match is fuzzy. Either warns, never blocks.
      let found: { part: Part; why: "name" | "ref" | "both" } | null = null;
      for (const p of state.parts) {
        const byRef = !!f.ref.trim() && code(f.ref) === code(p.ref);
        const byName = Math.max(score(f.nameFr, p.nameFr), f.nameEn ? score(f.nameEn, p.nameEn) : 0) >= THRESHOLD;
        if (byRef && byName) {
          found = { part: p, why: "both" };
          break;
        }
        if (byRef && found?.why !== "ref") found = { part: p, why: "ref" };
        else if (byName && !found) found = { part: p, why: "name" };
      }
      if (found) return setDup(found);
    }
    save();
  };

  const text = (key: "nameFr" | "nameEn" | "ref" | "supplier", label: string, help?: string, required?: boolean) => (
    <div className="form-group">
      <label htmlFor={`pt-${key}`}>{label}</label>
      <input id={`pt-${key}`} className="form-control" required={required} value={f[key]} onChange={(e) => set({ [key]: e.target.value })} />
      {help && <p className="help-block">{help}</p>}
    </div>
  );
  const money = (key: "price" | "cost", label: string, help?: string) => (
    <div className="form-group">
      <label htmlFor={`pt-${key}`}>{label}</label>
      <div className="input-group">
        <input id={`pt-${key}`} className="form-control" inputMode="decimal" value={f[key]} onChange={(e) => set({ [key]: e.target.value })} />
        <span className="input-group-addon">DH</span>
      </div>
      {help && <p className="help-block">{help}</p>}
    </div>
  );

  return (
    <>
      <form
        id="part-form"
        onSubmit={(e) => {
          e.preventDefault();
          trySave();
        }}
      >
        <PageHeader
          back="stock"
          title={existing ? pname(existing) : t("add_part")}
          actions={
            <>
              {existing && (
                <Link className="btn btn-sm btn-default" to={`stock/${existing.id}/history`}>
                  <Fa name="history" fw={false} /> {t("stock_history")}
                </Link>
              )}
              <HeaderButtons form="part-form" cancelTo="stock" />
            </>
          }
        />
        <div id="content">
          <div className="row">
            <div className="col-xs-12 col-md-6">
              <div className="panel panel-default">
                <div className="panel-heading">{t("part_details")}</div>
                <div className="panel-body">
                  {text("nameFr", t("name_fr"), t("name_fr_help"), true)}
                  {text("nameEn", t("name_en"), t("name_en_help"))}
                  {text("ref", t("reference_part_number"))}
                  {text("supplier", t("supplier"))}
                  {money("price", t("unit_price_excl_vat"))}
                  {admin && money("cost", t("cost_price"), t("cost_help"))}
                </div>
              </div>
            </div>
            <div className="col-xs-12 col-md-6">
              <div className="panel panel-default">
                <div className="panel-heading">{t("stock_column")}</div>
                <div className="panel-body">
                  <div className="form-group">
                    <label htmlFor="pt-qty">{t("current_quantity")}</label>
                    <input id="pt-qty" className="form-control" inputMode="numeric" value={f.qty} onChange={(e) => set({ qty: e.target.value })} />
                    {existing && <p className="help-block">{t("qty_edit_help")}</p>}
                  </div>
                  <div className="form-group">
                    <label htmlFor="pt-thr">{t("low_stock_threshold")}</label>
                    <input id="pt-thr" className="form-control" inputMode="numeric" value={f.threshold} onChange={(e) => set({ threshold: e.target.value })} />
                    <p className="help-block">{t("low_stock_help")}</p>
                  </div>
                </div>
              </div>
              <div className="panel panel-info">
                <div className="panel-heading">
                  <Fa name="info-circle" /> {t("on_invoices")}
                </div>
                <div className="panel-body">{t("on_invoices_help")}</div>
              </div>
            </div>
          </div>
        </div>
      </form>
      {dup && (
        <Dialog
          title={t("dup_title")}
          text={t(dup.why === "name" ? "dup_text" : dup.why === "ref" ? "dup_text_ref" : "dup_text_both", { name: `${pname(dup.part)} (${dup.part.ref || "—"} · ${t("stock_column")} ${dup.part.qty})` })}
          danger={false}
          confirmLabel={t("dup_create")}
          cancelLabel={t("dup_back")}
          onCancel={() => setDup(null)}
          onConfirm={() => {
            setDup(null);
            save();
          }}
        />
      )}
    </>
  );
}
