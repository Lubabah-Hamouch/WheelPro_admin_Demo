import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { computeInvoice, parse, realLines, type Computed, type DiscountUnit, type Invoice, type Line, type PayMethod } from "../calc";
import { emptyLine } from "../data";
import { formatAmount, formatCurrency } from "../format";
import { useI18n } from "../i18n";
import { clientLabel, findProduct, isReadOnly, productsOf, type PaymentError, type Product } from "../model";
import { score, search, THRESHOLD } from "../similar";
import { useStore, type FlashItem, type SaveOutcome } from "../store";
import { Badge, Dialog, DocLink, Dropdown, Fa, Link, MenuItem, Modal, PageHeader, StatusBadge } from "../ui";
import { Missing } from "./Services";

type Suspect = { key: string; name: string; match: Product };

/** The text a refused payment shows, worded as the server words it. */
export function usePaymentErrorText() {
  const { t } = useI18n();
  return (e: PaymentError) =>
    e === "exceeds_balance" ? t("payment_cannot_exceed_balance") : e === "date_required" ? t("pay_err_date") : e === "invoice" ? `${t("invoice")} ?` : t("pay_err_amount");
}

/** The notices a save leaves on the reloaded page: "updated", then each warning. */
export function useSaveNotices() {
  const { state } = useStore();
  const { t } = useI18n();
  const payText = usePaymentErrorText();
  return (o: SaveOutcome): FlashItem[] => {
    const out: FlashItem[] = [{ tone: "success", text: t("record_updated") }];
    if (o.negative.length) {
      const parts = o.negative.map((n) => `${state.parts.find((p) => p.id === n.partId)?.nameFr ?? "?"} (${formatAmount(n.balance) || "0"})`);
      out.push({ tone: "warning", text: t("stock_negative_warning", { parts: parts.join(", ") }) });
    }
    if (o.payError) out.push({ tone: "danger", text: `${t("pay_now")}: ${payText(o.payError)}` });
    if (o.credit) out.push({ tone: "warning", text: t("overpaid_warning", { paid: formatCurrency(o.credit.paid), total: formatCurrency(o.credit.total), credit: formatCurrency(o.credit.credit) }) });
    return out;
  };
}

export function InvoiceView({ id }: { id: string }) {
  const { state, computed, route, actions, navigate, setFlash, dirty, can, showLoader } = useStore();
  const { t, money, date, pname, taxLabel, methodLabel, statusLabel } = useI18n();
  const notices = useSaveNotices();
  const stored = state.invoices.find((i) => i.id === id);
  const [work, setWork] = useState<Invoice | undefined>(stored);
  const [openOpts, setOpenOpts] = useState<Set<string>>(new Set());
  const [suspects, setSuspects] = useState<Suspect[] | null>(null);
  const [modal, setModal] = useState<null | "pay" | "pay_full" | "copy" | "credit" | "delete" | "client">(() => (route.query.get("pay") ? "pay" : null));
  const [removingPay, setRemovingPay] = useState<string | null>(null);
  const [reopen, setReopen] = useState({ key: "", n: 0 });
  // "Record a payment now": the amount follows the running total until someone types their own.
  const [payNow, setPayNow] = useState({ on: false, typed: null as string | null, date: state.today, method: "cash" as PayMethod });

  // The screen edits its own copy; whenever the stored invoice changes (a save, a payment) it starts again from it.
  useEffect(() => {
    setWork(stored);
  }, [stored]);

  if (!stored || !work) return <Missing back="invoices" />;

  const c: Computed = computeInvoice(work, state.today);
  const savedC = computed.get(stored.id)!;
  const readOnly = isReadOnly(savedC.status, state.settings.readOnlyFrom, stored.locked);
  const isDraft = !stored.issued;
  const client = state.clients.find((x) => x.id === work.clientId);
  const products = productsOf(state);
  const parent = stored.creditParentId ? state.invoices.find((i) => i.id === stored.creditParentId) : undefined;

  const edit = (patch: Partial<Invoice>) => {
    dirty.current = true;
    setWork((w) => (w ? { ...w, ...patch } : w));
  };
  const setLine = (key: string, patch: Partial<Line>) => edit({ lines: work.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) });

  const addRow = () => {
    const line = emptyLine(state.settings.defaultTaxId, state.taxRates);
    edit({ lines: [...work.lines, line] });
    requestAnimationFrame(() => document.getElementById(`item-${line.key}`)?.focus());
  };

  const pick = (key: string, p: Product) => {
    const line = work.lines.find((l) => l.key === key);
    const rate = state.taxRates.find((r) => r.id === p.taxId)!;
    setLine(key, {
      productId: p.id,
      name: p.nameFr,
      price: p.price.toFixed(2),
      qty: line?.qty || "1",
      taxId: rate.id,
      taxPercent: rate.percent,
      // what the part cost us, frozen onto the line now like the price and the tax
      cost: p.kind === "part" ? p.cost : null,
    });
    requestAnimationFrame(() => {
      const el = document.getElementById(`qty-${key}`) as HTMLInputElement | null;
      el?.focus();
      el?.select();
    });
  };

  const payNowOffered = !readOnly && stored.payments.length === 0;
  const payNowAmount = payNow.typed ?? (c.total !== 0 ? formatAmount(c.total) : "");

  const doSave = () => {
    dirty.current = false;
    showLoader();
    const outcome = actions.saveInvoice(work, payNowOffered && payNow.on ? { amount: payNowAmount, date: payNow.date, method: payNow.method } : undefined);
    setPayNow((x) => ({ ...x, on: false, typed: null }));
    setFlash(notices(outcome));
  };

  // Before saving, every new custom line is compared with the whole catalogue.
  const save = () => {
    const list: Suspect[] = [];
    for (const l of realLines(work)) {
      if (l.productId) continue;
      let best: Product | null = null;
      let bestScore = 0;
      for (const p of products) {
        const s = Math.max(score(l.name, p.nameFr), score(l.name, p.nameEn));
        if (s > bestScore) {
          bestScore = s;
          best = p;
        }
      }
      if (best && bestScore >= THRESHOLD) list.push({ key: l.key, name: l.name.trim(), match: best });
    }
    if (list.length) setSuspects(list);
    else doSave();
  };

  const stockTag = (p: Product) => {
    if (p.kind === "service") return <Badge tone="neutral">{t("kind_service")}</Badge>;
    const live = state.parts.find((x) => x.id === p.id);
    const qty = live?.qty ?? 0;
    const tone = qty <= 0 ? "danger" : qty <= (live?.threshold ?? 0) ? "warning" : "info";
    return <Badge tone={tone}>{t("part_stock", { n: qty })}</Badge>;
  };

  const shares = new Map(c.lines.map((l) => [l.key, l]));
  const title = stored.number ? `${t("facture_no")} ${stored.number}` : t("wp_draft");

  return (
    <>
      <PageHeader
        back="invoices"
        title={title}
        extra={
          <>
            {!isDraft && (
              <>
                {" "}
                <StatusBadge c={savedC} />
              </>
            )}
            {isDraft && savedC.overdue && (
              <>
                {" "}
                <Badge tone="overdue">{t("overdue")}</Badge>
              </>
            )}
          </>
        }
        actions={
          <div className="btn-group btn-group-sm">
            <Dropdown
              right
              wrapClass="options btn-group btn-group-sm"
              toggle={
                <>
                  <i className="fa fa-caret-down" /> {t("options")}
                </>
              }
            >
              <MenuItem icon="minus" onClick={() => setModal("credit")}>
                {t("create_credit_invoice")}
              </MenuItem>
              {savedC.balance !== 0 && savedC.total !== 0 && (
                <>
                  <MenuItem icon="credit-card" onClick={() => setModal("pay")}>
                    {t("enter_payment")}
                  </MenuItem>
                  <MenuItem icon="check" onClick={() => setModal("pay_full")}>
                    {t("mark_as_paid")}
                  </MenuItem>
                </>
              )}
              <li className="divider" />
              <MenuItem icon="copy" onClick={() => setModal("copy")}>
                {t("copy_invoice")}
              </MenuItem>
              {isDraft && can("records.delete") && (
                <MenuItem icon="trash-o" onClick={() => setModal("delete")}>
                  {t("delete")}
                </MenuItem>
              )}
            </Dropdown>
            <DocLink to={`invoices/${stored.id}/facture`} className="btn btn-sm btn-default">
              <Fa name="print" fw={false} /> {t("download_pdf")}
            </DocLink>
            {!readOnly && (
              <button type="button" className="btn btn-sm btn-success" onClick={save}>
                <Fa name="check" fw={false} /> {t("save")}
              </button>
            )}
          </div>
        }
      />
      <div id="content">
        {parent && (
          <div className="alert alert-warning">
            <i className="fa fa-minus-circle" />
            &nbsp;<Link to={`invoices/${parent.id}`}>{`${t("credit_invoice_for_invoice")} ${parent.number ?? ""}`}</Link>
          </div>
        )}

        <div className="row">
          <div className="col-xs-12 col-md-5">
            <div className="wp-card">
              <div className="wp-card-header">
                <span className="wp-card-title">
                  <Fa name="user" /> {t("client")}
                </span>
              </div>
              <div className="wp-card-body wp-invoice-client">
                <div className="wp-invoice-client-name">
                  <Link to={`clients/${work.clientId}`}>{clientLabel(client)}</Link>
                  {isDraft && !stored.creditParentId && (
                    <>
                      {" "}
                      <button type="button" className="btn btn-link btn-xs" data-tip={t("change_client")} aria-label={t("change_client")} onClick={() => setModal("client")}>
                        <i className="fa fa-edit" />
                      </button>
                    </>
                  )}
                </div>
                {client && (client.address || client.city) && (
                  <div className="client-address">
                    {client.address && (
                      <>
                        {client.address}
                        <br />
                      </>
                    )}
                    {[client.zip, client.city].filter(Boolean).join(" ")}
                  </div>
                )}
                {client?.phone && (
                  <div>
                    <Fa name="phone" /> {client.phone}
                  </div>
                )}
                {client?.email && (
                  <div>
                    <Fa name="envelope-o" /> <a href={`mailto:${client.email}`}>{client.email}</a>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="col-xs-12 col-md-7">
            <div className="wp-card">
              <div className="wp-card-header">
                <span className="wp-card-title">
                  <Fa name="file-text-o" /> {t("invoice")}
                </span>
              </div>
              <div className="wp-card-body">
                <div className="form-group wp-invoice-field-primary">
                  <label htmlFor="inv-vehicle">Véhicule / Immatriculation</label>
                  <input id="inv-vehicle" className="form-control" value={work.vehicle} disabled={readOnly} onChange={(e) => edit({ vehicle: e.target.value })} />
                </div>
                <div className="row">
                  <div className="col-xs-12 col-sm-6 form-group">
                    <label htmlFor="inv-number">{t("invoice")} #</label>
                    {isDraft ? (
                      <>
                        <input
                          id="inv-number"
                          className="form-control"
                          value={work.number ?? ""}
                          placeholder={t("not_set")}
                          disabled={readOnly}
                          onChange={(e) => edit({ number: e.target.value || null })}
                        />
                        <p className="help-block">{t("number_locked")}</p>
                      </>
                    ) : (
                      <div className="input-group">
                        <input id="inv-number" className="form-control" readOnly value={stored.number ?? ""} />
                        <span className="input-group-addon">
                          <i className="fa fa-lock" />
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="col-xs-12 col-sm-6 form-group">
                    <label htmlFor="inv-status">{t("status")}</label>
                    {isDraft ? (
                      <select id="inv-status" className="form-control" value={work.issued ? "unpaid" : "draft"} disabled={readOnly} onChange={(e) => edit({ issued: e.target.value === "unpaid" })}>
                        <option value="draft">{statusLabel("draft")}</option>
                        <option value="unpaid">{statusLabel("unpaid")}</option>
                      </select>
                    ) : (
                      <>
                        <div className="wp-invoice-status">
                          <StatusBadge c={savedC} />
                        </div>
                        <p className="help-block">{t("status_follows")}</p>
                      </>
                    )}
                  </div>
                  <div className="col-xs-12 col-sm-6 form-group">
                    <label htmlFor="inv-date">{t("invoice_date")}</label>
                    <input id="inv-date" type="date" className="form-control" value={work.date} disabled={readOnly} onChange={(e) => e.target.value && edit({ date: e.target.value })} />
                  </div>
                  <div className="col-xs-12 col-sm-6 form-group">
                    <label htmlFor="inv-due">{t("due_date")}</label>
                    <input id="inv-due" type="date" className="form-control" value={work.due} disabled={readOnly} onChange={(e) => e.target.value && edit({ due: e.target.value })} />
                  </div>
                  <div className="col-xs-12 form-group wp-facture-options">
                    <label className="control-label">{t("facture_options")}</label>
                    <div className="checkbox">
                      <label htmlFor="include_cnss">
                        <input type="checkbox" id="include_cnss" checked={work.includeCnss} disabled={readOnly} onChange={(e) => edit({ includeCnss: e.target.checked })} /> {t("include_cnss")}
                      </label>
                    </div>
                    <div className="checkbox">
                      <label htmlFor="include_rib">
                        <input type="checkbox" id="include_rib" checked={work.includeRib} disabled={readOnly} onChange={(e) => edit({ includeRib: e.target.checked })} /> {t("include_rib")}
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="wp-card">
          <div className="wp-card-header">
            <span className="wp-card-title">
              <Fa name="list" /> {t("items_title")}
            </span>
            <span className="wp-card-sub">{t("items_help")}</span>
          </div>
          <div className="table-responsive">
            <table className="wp-table wp-items" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th className="wp-item-handle" />
                  <th>{t("item_col")}</th>
                  <th className="wp-item-qty wp-num">{t("quantity")}</th>
                  <th className="wp-item-price wp-num">{t("price")}</th>
                  <th className="wp-item-total wp-num">{t("total")}</th>
                  <th className="wp-item-actions" />
                </tr>
              </thead>
              {work.lines.length === 0 && (
                <tbody>
                  <tr>
                    <td colSpan={6} className="text-center wp-dash-muted" style={{ padding: 24 }}>
                      {t("no_lines")}
                    </td>
                  </tr>
                </tbody>
              )}
              {work.lines.map((l) => {
                const res = shares.get(l.key);
                const prod = findProduct(state, l.productId);
                const blank = !l.name.trim();
                const optsOpen = openOpts.has(l.key);
                const rateIsDefault = l.taxId === state.settings.defaultTaxId;
                const disc = parse(l.discount);
                return (
                  <tbody className="item" key={l.key}>
                    <tr>
                      <td className="wp-item-handle">
                        <i className="fa fa-arrows-v" />
                      </td>
                      <td>
                        <ItemCombo
                          line={l}
                          shown={prod ? pname(prod) : l.name}
                          products={products}
                          disabled={readOnly}
                          stockTag={stockTag}
                          onType={(name) => setLine(l.key, { name, productId: null, cost: null, ...(l.qty === "" && name.trim() ? { qty: "1" } : {}) })}
                          onPick={(p) => pick(l.key, p)}
                          reopen={reopen.key === l.key ? reopen.n : 0}
                        />
                        <div className="wp-item-meta">
                          {prod ? (
                            <>
                              {stockTag(prod)}
                              <span className="wp-dash-muted">{prod.ref}</span>
                            </>
                          ) : (
                            !blank && (
                              <span className="wp-badge wp-badge--custom" title={t("custom_line_title")}>
                                {t("custom_line")}
                              </span>
                            )
                          )}
                          {!readOnly && (
                            <a
                              href="#"
                              className="wp-item-opts-toggle"
                              onClick={(e) => {
                                e.preventDefault();
                                setOpenOpts((s) => {
                                  const n = new Set(s);
                                  if (n.has(l.key)) n.delete(l.key);
                                  else n.add(l.key);
                                  return n;
                                });
                              }}
                            >
                              <Fa name={optsOpen ? "caret-down" : "caret-right"} fw={false} /> {t("tax_discount")}
                            </a>
                          )}
                          {(!rateIsDefault || disc > 0) && (
                            <span className="wp-item-opts-summary">
                              {taxLabel(l.taxId, l.taxPercent)}
                              {disc > 0 ? ` · −${money(disc)} ${t("per_unit")}` : ""}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="wp-item-qty">
                        <input
                          id={`qty-${l.key}`}
                          className="form-control amount"
                          inputMode="decimal"
                          aria-label={t("quantity")}
                          value={l.qty}
                          disabled={readOnly}
                          onChange={(e) => setLine(l.key, { qty: e.target.value })}
                        />
                      </td>
                      <td className="wp-item-price">
                        <input
                          className="form-control amount"
                          inputMode="decimal"
                          aria-label={t("price")}
                          value={l.price}
                          disabled={readOnly}
                          onChange={(e) => setLine(l.key, { price: e.target.value })}
                        />
                      </td>
                      <td className="wp-item-total">
                        {res ? money(res.lineTotal) : ""}
                        {res && res.share !== 0 && (
                          <span className={`wp-share${res.absorbsRemainder ? " is-remainder" : ""}`}>
                            −{money(res.share)} {res.absorbsRemainder ? t("incl_rounding") : t("invoice_disc_short")}
                          </span>
                        )}
                      </td>
                      <td className="wp-item-actions">
                        {!readOnly && (
                          <button
                            type="button"
                            className="btn btn-link btn-sm"
                            title={t("remove_line")}
                            aria-label={t("remove_line")}
                            onClick={() => edit({ lines: work.lines.filter((x) => x.key !== l.key) })}
                          >
                            <i className="fa fa-trash-o text-danger" />
                          </button>
                        )}
                      </td>
                    </tr>
                    {optsOpen && !readOnly && (
                      <tr className="wp-item-desc-row">
                        <td />
                        <td colSpan={4}>
                          <div className="wp-item-opts">
                            <label>
                              {t("tax_rate")}
                              <select
                                className="form-control input-sm"
                                value={l.taxId}
                                onChange={(e) => {
                                  const r = state.taxRates.find((x) => x.id === e.target.value)!;
                                  setLine(l.key, { taxId: r.id, taxPercent: r.percent });
                                }}
                              >
                                {state.taxRates.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {taxLabel(r.id)}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              {t("discount_per_unit")}
                              <div className="input-group input-group-sm">
                                <input
                                  className="form-control text-right"
                                  inputMode="decimal"
                                  placeholder="0.00"
                                  value={l.discount}
                                  onChange={(e) => setLine(l.key, { discount: e.target.value })}
                                />
                                <span className="input-group-addon">DH</span>
                              </div>
                            </label>
                          </div>
                        </td>
                        <td />
                      </tr>
                    )}
                  </tbody>
                );
              })}
            </table>
          </div>
          <div className="wp-items-footer wp-card-body">
            <div className="wp-items-add">
              {!readOnly && (
                <button type="button" className="btn btn-default btn-sm" onClick={addRow}>
                  <Fa name="plus" fw={false} /> {t("add_row")}
                </button>
              )}
              <span className="wp-dash-muted" style={{ fontSize: 12, maxWidth: 360 }}>
                {t("discount_help")}
              </span>
            </div>
            <table className="wp-totals">
              <tbody>
                <tr>
                  <th>{t("subtotal")}</th>
                  <td>{money(c.subtotal)}</td>
                </tr>
                <tr className="wp-totals-discount">
                  <th>
                    {t("discount")}
                    <span className="wp-discount-input">
                      <input
                        className="form-control text-right"
                        inputMode="decimal"
                        placeholder="0"
                        aria-label={t("discount")}
                        value={work.discount.value}
                        disabled={readOnly}
                        onChange={(e) => edit({ discount: { ...work.discount, value: e.target.value } })}
                      />
                      <span className="btn-group btn-group-xs" role="group">
                        {(["percent", "amount"] as DiscountUnit[]).map((u) => (
                          <button
                            key={u}
                            type="button"
                            disabled={readOnly}
                            className={`btn ${work.discount.unit === u ? "btn-primary" : "btn-default"}`}
                            aria-pressed={work.discount.unit === u}
                            onClick={() => edit({ discount: { ...work.discount, unit: u } })}
                          >
                            {u === "percent" ? "%" : "DH"}
                          </button>
                        ))}
                      </span>
                    </span>
                  </th>
                  <td>{c.given ? `−${money(c.given)}` : money(0)}</td>
                </tr>
                {c.given !== 0 && (
                  <tr>
                    <th>{t("total_excl_vat")}</th>
                    <td>{money(c.net)}</td>
                  </tr>
                )}
                {(c.vat.length ? c.vat : [{ taxId: state.settings.defaultTaxId, percent: state.taxRates.find((r) => r.id === state.settings.defaultTaxId)?.percent ?? 20, amount: 0 }]).map((v) => (
                  <tr key={`${v.taxId}|${v.percent}`}>
                    <th>{taxLabel(v.taxId, v.percent)}</th>
                    <td>{money(v.amount)}</td>
                  </tr>
                ))}
                <tr className="wp-totals-grand">
                  <th>{t("total")}</th>
                  <td>{money(c.total)}</td>
                </tr>
                <tr>
                  <th>{t("paid")}</th>
                  <td>{money(c.paid)}</td>
                </tr>
                <tr className="wp-totals-balance">
                  <th>{t("balance")}</th>
                  <td className={c.balance > 0 && work.issued ? "text-danger" : c.balance <= 0 && work.issued ? "text-success" : ""}>
                    {c.balance < 0 ? t("credit_amount", { amount: money(-c.balance) }) : money(c.balance)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="wp-card wp-pay-list">
          <div className="wp-card-header">
            <span className="wp-card-title">
              <Fa name="money" /> {t("payments")}
            </span>
            {savedC.balance !== 0 && savedC.total !== 0 && (
              <div className="btn-group btn-group-sm">
                <button type="button" className="btn btn-default" onClick={() => setModal("pay")}>
                  <i className="fa fa-plus" /> {t("enter_payment")}
                </button>
                <button type="button" className="btn btn-primary" onClick={() => setModal("pay_full")}>
                  <i className="fa fa-check" /> {t("mark_as_paid")}
                </button>
              </div>
            )}
          </div>
          {stored.payments.length === 0 && <div className="wp-card-body text-muted">{t("no_payments")}</div>}
          {payNowOffered && (
            <div className="wp-card-body wp-pay-now">
              <label className="wp-pay-now-toggle">
                <input
                  type="checkbox"
                  id="pay_now"
                  checked={payNow.on}
                  onChange={(e) => {
                    dirty.current = true;
                    setPayNow((x) => ({ ...x, on: e.target.checked }));
                  }}
                />{" "}
                {t("pay_now")}
              </label>
              {payNow.on && (
                <div className="wp-pay-now-fields">
                  <div className="form-group">
                    <label htmlFor="pn-amount">{t("amount")}</label>
                    <input id="pn-amount" className="form-control" value={payNowAmount} onChange={(e) => setPayNow((x) => ({ ...x, typed: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="pn-date">{t("date")}</label>
                    <input id="pn-date" type="date" className="form-control" value={payNow.date} onChange={(e) => setPayNow((x) => ({ ...x, date: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label htmlFor="pn-method">{t("payment_method")}</label>
                    <select id="pn-method" className="form-control" value={payNow.method} onChange={(e) => setPayNow((x) => ({ ...x, method: e.target.value as PayMethod }))}>
                      {(["cash", "cheque", "transfer"] as const).map((m) => (
                        <option key={m} value={m}>
                          {methodLabel(m)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="help-block">{t("pay_now_hint")}</p>
                </div>
              )}
            </div>
          )}
          {stored.payments.length > 0 && (
            <div className="table-responsive">
              <table className="wp-table table">
                <thead>
                  <tr>
                    <th>{t("payment_date")}</th>
                    <th>{t("payment_method")}</th>
                    <th className="text-right">{t("amount")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {stored.payments.map((p) => (
                    <tr key={p.id}>
                      <td>{date(p.date)}</td>
                      <td>{methodLabel(p.method)}</td>
                      <td className="wp-num">{money(p.amount)}</td>
                      <td className="text-right">
                        <button type="button" className="btn btn-xs btn-danger" onClick={() => setRemovingPay(p.id)}>
                          <i className="fa fa-trash" /> {t("delete")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="wp-payments-foot">
                  <tr>
                    <th colSpan={2}>{t("paid")}</th>
                    <td className="wp-num">{money(savedC.paid)}</td>
                    <td />
                  </tr>
                  <tr>
                    <th colSpan={2}>{t("balance")}</th>
                    <td className="wp-num">{balanceLabel(savedC, money, t)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
        <InvoiceStock id={stored.id} />
      </div>

      {suspects && (
        <Dialog
          wide
          title={t("check_title")}
          danger={false}
          confirmLabel={t("save_as_custom")}
          cancelLabel={t("go_back_select")}
          onCancel={() => {
            const first = suspects[0];
            setSuspects(null);
            setReopen((r) => ({ key: first.key, n: r.n + 1 }));
          }}
          onConfirm={() => {
            setSuspects(null);
            doSave();
          }}
        >
          <ul className="wp-item-check-list">
            {suspects.map((s) => (
              <li key={s.key}>
                {t(s.match.kind === "part" ? "check_part" : "check_service", { typed: s.name, match: pname(s.match) })} {stockTag(s.match)}
              </li>
            ))}
          </ul>
        </Dialog>
      )}

      {(modal === "pay" || modal === "pay_full") && <PaymentModal invoice={stored} c={savedC} full={modal === "pay_full"} onClose={() => setModal(null)} />}
      {modal === "copy" && <CopyModal invoice={stored} onClose={() => setModal(null)} />}
      {modal === "credit" && <CreditModal invoice={stored} onClose={() => setModal(null)} />}
      {modal === "client" && <ChangeClientModal current={work.clientId} onClose={() => setModal(null)} onPick={(clientId) => (edit({ clientId }), setModal(null))} />}
      {modal === "delete" && (
        <Modal
          title={t("delete_invoice")}
          onClose={() => setModal(null)}
          onSubmit={() => {
            dirty.current = false;
            actions.deleteInvoice(stored.id);
            setFlash({ tone: "success", text: t("record_deleted") });
            navigate("invoices", true);
          }}
          submitLabel={t("confirm_deletion")}
          submitIcon="trash-o"
          submitClass="btn-danger"
          cancelClass="btn-default"
        >
          <div className="alert alert-danger no-margin">{t("delete_invoice_warning")}</div>
        </Modal>
      )}

      {removingPay && (
        <Dialog
          title={t("confirm_delete_title")}
          text={t("delete_payment_text")}
          confirmLabel={t("delete")}
          onCancel={() => setRemovingPay(null)}
          onConfirm={() => {
            showLoader();
            actions.deletePayment(stored.id, removingPay);
            setRemovingPay(null);
          }}
        />
      )}
    </>
  );
}

/** "Trop-perçu : 4.00 DH" where money is owed back, the plain balance otherwise. */
export function balanceLabel(c: Computed, money: (n: number) => string, t: (k: "credit_amount", v: Record<string, string>) => string) {
  const owed = c.total >= 0 ? c.balance < 0 : c.balance > 0;
  return owed && c.balance !== 0 ? t("credit_amount", { amount: money(Math.abs(c.balance)) }) : money(c.balance);
}

/** Enter Payment / Mark as Paid. Checked on Submit, the refusal shown above the fields. */
export function PaymentModal({ invoice, c, full, onClose }: { invoice: Invoice; c: Computed; full: boolean; onClose: () => void }) {
  const { state, actions, showLoader } = useStore();
  const { t, methodLabel } = useI18n();
  const errText = usePaymentErrorText();
  const [amount, setAmount] = useState(full ? formatAmount(c.balance) : "");
  const [day, setDay] = useState(state.today);
  const [method, setMethod] = useState<PayMethod>("cash");
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      headingTag="h3"
      title={full ? t("mark_as_paid") : t("enter_payment")}
      onClose={onClose}
      onSubmit={() => {
        const err = actions.addPayment(invoice.id, amount, day, method);
        if (err) return setError(errText(err));
        showLoader();
        onClose();
      }}
    >
      {error && <div className="alert alert-danger">{error}</div>}
      <p className="text-muted">
        {t("invoice")} {invoice.number || t("wp_draft")} · {t("balance")}: {formatCurrency(c.balance)}
      </p>
      <div className="form-group">
        <label htmlFor="payment_amount">{t("amount")}</label>
        <input id="payment_amount" className="form-control" autoFocus autoComplete="off" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="form-group">
        <label htmlFor="payment_date">{t("payment_date")}</label>
        <div className="input-group">
          <input id="payment_date" type="date" className="form-control" value={day} onChange={(e) => setDay(e.target.value)} />
          <span className="input-group-addon">
            <i className="fa fa-calendar fa-fw" />
          </span>
        </div>
      </div>
      <div className="form-group">
        <label htmlFor="payment_method_id">{t("payment_method")}</label>
        <select id="payment_method_id" className="form-control" value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>
          {(["cash", "cheque", "transfer"] as const).map((m) => (
            <option key={m} value={m}>
              {methodLabel(m)}
            </option>
          ))}
        </select>
      </div>
    </Modal>
  );
}

/** The client picker the real dialogs use: active clients only, by name. */
function ClientSelect({ id, value, onChange, keep }: { id: string; value: string; onChange: (v: string) => void; keep?: string }) {
  const { state } = useStore();
  return (
    <select id={id} className="form-control" value={value} onChange={(e) => onChange(e.target.value)} autoFocus>
      <option value="" />
      {[...state.clients]
        .filter((x) => x.active || x.id === keep)
        .sort((a, b) => clientLabel(a).localeCompare(clientLabel(b), "fr"))
        .map((x) => (
          <option key={x.id} value={x.id}>
            {clientLabel(x)}
          </option>
        ))}
    </select>
  );
}

function CopyModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const { state, actions, navigate, setFlash, dirty } = useStore();
  const { t } = useI18n();
  const active = state.clients.find((x) => x.id === invoice.clientId && x.active);
  const [client, setClient] = useState(active ? invoice.clientId : "");
  const [day, setDay] = useState(state.today);
  const [error, setError] = useState(false);
  return (
    <Modal
      title={t("copy_invoice")}
      onClose={onClose}
      onSubmit={() => {
        if (!client) return setError(true);
        dirty.current = false;
        const id = actions.copyInvoice(invoice, client, day);
        setFlash({ tone: "success", text: t("record_created") });
        onClose();
        navigate(`invoices/${id}`, true);
      }}
    >
      <div className={`form-group${error ? " has-error" : ""}`}>
        <label htmlFor="client_id">{t("client")}</label>
        <ClientSelect id="client_id" value={client} onChange={(v) => (setClient(v), setError(false))} />
        {error && <p className="help-block">{t("field_required", { field: t("client") })}</p>}
      </div>
      <div className="form-group">
        <label htmlFor="invoice_date_created_modal">{t("invoice_date")}</label>
        <input id="invoice_date_created_modal" type="date" className="form-control" value={day} onChange={(e) => setDay(e.target.value)} />
      </div>
    </Modal>
  );
}

function CreditModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const { state, actions, navigate, setFlash, dirty } = useStore();
  const { t, date } = useI18n();
  const client = state.clients.find((x) => x.id === invoice.clientId);
  return (
    <Modal
      large
      title={t("create_credit_invoice")}
      submitLabel={t("confirm")}
      onClose={onClose}
      onSubmit={() => {
        dirty.current = false;
        const id = actions.createCredit(invoice.id);
        setFlash({ tone: "success", text: t("record_created") });
        onClose();
        navigate(`invoices/${id}`, true);
      }}
    >
      <p>
        <strong>{t("credit_invoice_details")}</strong>
      </p>
      <ul>
        <li>
          {t("client")}: {client?.name}
        </li>
        <li>
          {t("credit_invoice_date")}: {date(state.today)}
        </li>
      </ul>
      <div className="alert alert-danger no-margin" dangerouslySetInnerHTML={{ __html: t("create_credit_invoice_alert") }} />
    </Modal>
  );
}

function ChangeClientModal({ current, onClose, onPick }: { current: string; onClose: () => void; onPick: (id: string) => void }) {
  const { t } = useI18n();
  const [value, setValue] = useState(current);
  return (
    <Modal title={t("change_client")} onClose={onClose} onSubmit={() => value && onPick(value)}>
      <div className="form-group">
        <label htmlFor="change_client_id">{t("client")}</label>
        <ClientSelect id="change_client_id" value={value} onChange={setValue} keep={current} />
      </div>
    </Modal>
  );
}

/** The Item field: a combobox over services and parts. Picking links the line; typing unlinks it. */
function ItemCombo({
  line,
  shown,
  products,
  disabled,
  stockTag,
  onType,
  onPick,
  reopen,
}: {
  reopen: number;
  line: Line;
  shown: string;
  products: Product[];
  disabled: boolean;
  stockTag: (p: Product) => ReactNode;
  onType: (name: string) => void;
  onPick: (p: Product) => void;
}) {
  const { t, money, pname } = useI18n();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<CSSProperties>({});
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const found = open ? search(shown, products, (p) => `${p.ref} ${p.nameFr} ${p.nameEn} ${p.descFr} ${p.descEn}`) : [];

  // "Go back and select it": the line takes the focus again, with its matches listed.
  useEffect(() => {
    if (!reopen) return;
    input.current?.focus();
    setActive(0);
    setOpen(true);
  }, [reopen]);

  const place = () => {
    const r = input.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, Math.min(460, window.innerWidth - 24)) });
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  const choose = (p: Product | undefined) => {
    if (!p) return;
    onPick(p);
    setOpen(false);
  };
  const showList = open && shown.trim() !== "";

  return (
    <div className="wp-combo">
      <i className="fa fa-search" aria-hidden="true" />
      <input
        ref={input}
        id={`item-${line.key}`}
        type="text"
        className="form-control"
        role="combobox"
        aria-label={t("item_search")}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && found[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        placeholder={t("item_placeholder")}
        value={shown}
        disabled={disabled}
        onChange={(e) => {
          onType(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) return setOpen(true);
            if (!found.length) return;
            setActive((i) => (i + (e.key === "ArrowDown" ? 1 : found.length - 1)) % found.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (showList) choose(found[active]);
          } else if (e.key === "Escape" || e.key === "Tab") {
            setOpen(false);
          }
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
      />
      {showList && (
        <div className="wp-item-search-results" id={listId} role="listbox" style={pos}>
          {found.length === 0 ? (
            <div className="wp-item-search-empty">{t("no_match_custom")}</div>
          ) : (
            found.map((p, i) => (
              <button
                key={p.id}
                id={`${listId}-${i}`}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={i === active}
                className={`wp-item-search-result${i === active ? " is-active" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(p);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <span className="wp-item-search-name">
                  {pname(p)}
                  <small>{p.ref}</small>
                </span>
                {stockTag(p)}
                <span className="wp-item-search-price">{money(p.price)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** The stock this invoice has moved, each row linking to the part's history. */
function InvoiceStock({ id }: { id: string }) {
  const { state } = useStore();
  const { t, pname, dateTime } = useI18n();
  const rows = state.movements.filter((m) => m.invoiceId === id);
  if (!rows.length) return null;
  return (
    <div className="wp-card">
      <div className="wp-card-header">
        <span className="wp-card-title">
          <Fa name="cubes" /> {t("stock_moved")}
        </span>
        <span className="wp-card-sub">{t("stock_moved_sub")}</span>
      </div>
      <div className="table-responsive">
        <table className="wp-table">
          <thead>
            <tr>
              <th>{t("when")}</th>
              <th>{t("part_name")}</th>
              <th>{t("reason")}</th>
              <th className="text-right">{t("change")}</th>
              <th className="text-right">{t("balance_after")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const p = state.parts.find((x) => x.id === m.partId);
              return (
                <tr key={m.id}>
                  <td className="wp-nowrap">{dateTime(m.at)}</td>
                  <td>{p ? <Link to={`stock/${p.id}/history`}>{pname(p)}</Link> : "—"}</td>
                  <td>{t(`reason_${m.reason}`)}</td>
                  <td className={`wp-num ${m.change < 0 ? "text-danger" : "text-success"}`}>
                    {m.change > 0 ? "+" : ""}
                    {m.change}
                  </td>
                  <td className={`wp-num${m.balance < 0 ? " text-danger" : ""}`}>{m.balance}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

