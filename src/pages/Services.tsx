import { useState } from "react";
import { useAppUi } from "../appui";
import { parse } from "../calc";
import { useI18n } from "../i18n";
import type { Service } from "../model";
import { score, search, THRESHOLD } from "../similar";
import { useGuard, useStore } from "../store";
import { Badge, Blank, Dialog, Dropdown, Fa, HeaderButtons, Link, MenuItem, orBlank, PageHeader, rowLink, sorted, SortTh, useSort } from "../ui";

/** The catalogue of services. Stock parts live in Inventory, their source of truth. */
export function Services() {
  const { state, navigate, actions, setFlash, can } = useStore();
  const { t, money, pname, pdesc, taxLabel } = useI18n();
  const { filter } = useAppUi();
  const [sort, setSort] = useSort({ key: "name", dir: "asc" });
  const [deleting, setDeleting] = useState<Service | null>(null);
  const canEdit = can("products.manage");
  const canDelete = can("records.delete");

  const used = (id: string) => state.invoices.some((i) => i.lines.some((l) => l.productId === id));
  const rows = filter.trim() ? search(filter, state.services, (s) => `${s.ref} ${s.nameFr} ${s.nameEn} ${s.descFr} ${s.descEn}`) : state.services;
  const list = sorted(rows, sort, (s, k) => (k === "name" ? pname(s) : k === "sku" ? s.ref : k === "price" ? s.price : ""));

  return (
    <>
      <PageHeader
        title={t("nav_services")}
        actions={
          canEdit && (
            <Link className="btn btn-sm btn-primary" to="services/new">
              <Fa name="plus" fw={false} /> {t("new")}
            </Link>
          )
        }
      />
      <div id="content" className="table-content">
        <div className="table-responsive">
          <table className="wp-table table-hover table-striped">
            <thead>
              <tr>
                <SortTh id="family" label={t("family")} sort={sort} setSort={setSort} />
                <SortTh id="sku" label={t("sku")} sort={sort} setSort={setSort} />
                <SortTh id="name" label={t("name")} sort={sort} setSort={setSort} />
                <th>{t("product_description")}</th>
                <SortTh id="price" label={t("price")} sort={sort} setSort={setSort} amount />
                <SortTh id="unit" label={t("product_unit")} sort={sort} setSort={setSort} />
                <th>{t("tax_rate")}</th>
                {canEdit && <th>{t("options")}</th>}
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center wp-dash-muted">
                    {filter.trim() ? t("no_results") : t("no_services")}
                  </td>
                </tr>
              )}
              {list.map((s) => (
                <tr key={s.id} {...(canEdit ? rowLink(navigate, `services/${s.id}`) : {})}>
                  <td>
                    <Blank />
                  </td>
                  <td>{orBlank(s.ref)}</td>
                  <td>
                    {canEdit ? (
                      <Link to={`services/${s.id}`} title={t("edit")}>
                        {pname(s)}
                      </Link>
                    ) : (
                      pname(s)
                    )}{" "}
                    <Badge tone="neutral">{t("kind_service")}</Badge>
                  </td>
                  <td>{orBlank(pdesc(s))}</td>
                  <td className="wp-num">{money(s.price)}</td>
                  <td>
                    <Blank />
                  </td>
                  <td>{taxLabel(s.taxId)}</td>
                  {canEdit && (
                    <td>
                      <Dropdown
                        right
                        toggle={
                          <>
                            <i className="fa fa-cog" /> {t("options")}
                          </>
                        }
                      >
                        <MenuItem icon="edit" onClick={() => navigate(`services/${s.id}`)}>
                          {t("edit")}
                        </MenuItem>
                        {canDelete && (
                          <MenuItem icon="trash-o" onClick={() => setDeleting(s)}>
                            {t("delete")}
                          </MenuItem>
                        )}
                      </Dropdown>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {deleting && (
        <Dialog
          title={t("confirm_delete_title")}
          text={used(deleting.id) ? t("service_in_use") : t("confirm_delete_text", { name: pname(deleting) })}
          confirmLabel={t("delete")}
          confirmDisabled={used(deleting.id)}
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            actions.deleteService(deleting.id);
            setFlash({ tone: "success", text: t("deleted", { name: pname(deleting) }) });
            setDeleting(null);
          }}
        />
      )}
    </>
  );
}

const blankService = (taxId: string): Service => ({
  id: "",
  ref: "",
  nameFr: "",
  nameEn: "",
  descFr: "",
  descEn: "",
  price: 0,
  taxId,
  provider: "",
  purchasePrice: null,
});

/** Creating or editing a catalogue service: Admin only (products.manage), refused for Staff by URL too. */
export function ServiceForm({ id }: { id: string | null }) {
  const { t } = useI18n();
  const allowed = useGuard("products.manage", t("not_allowed"));
  return allowed ? <ServiceFormBody id={id} /> : null;
}

function ServiceFormBody({ id }: { id: string | null }) {
  const { state, actions, navigate, setFlash, dirty, showLoader } = useStore();
  const { t, pname, taxLabel } = useI18n();
  const existing = id ? state.services.find((s) => s.id === id) : undefined;
  const [f, setF] = useState<Service>(() => existing ?? blankService(state.settings.defaultTaxId));
  const [price, setPrice] = useState(() => (existing ? existing.price.toFixed(2) : ""));
  const [purchase, setPurchase] = useState(() => (existing?.purchasePrice != null ? existing.purchasePrice.toFixed(2) : ""));
  const [similar, setSimilar] = useState<Service | null>(null);
  if (id && !existing) return <Missing back="services" />;

  const set = (patch: Partial<Service>) => {
    dirty.current = true;
    setF((x) => ({ ...x, ...patch }));
  };

  const save = () => {
    dirty.current = false;
    showLoader();
    actions.saveService({ ...f, price: parse(price), purchasePrice: purchase.trim() === "" ? null : parse(purchase) });
    setFlash({ tone: "success", text: existing ? t("record_updated") : t("record_created") });
    navigate("services", true);
  };

  const trySave = () => {
    if (!f.nameFr.trim()) return;
    // Only on create: an item can never match itself.
    if (!existing) {
      const hit = state.services.find((s) => Math.max(score(f.nameFr, s.nameFr), f.nameEn ? score(f.nameEn, s.nameEn) : 0) >= THRESHOLD);
      if (hit) return setSimilar(hit);
    }
    save();
  };

  const input = (key: "nameFr" | "nameEn" | "descFr" | "descEn" | "ref" | "provider", label: string, help?: string, required?: boolean) => (
    <div className="form-group">
      <label htmlFor={`sv-${key}`}>{label}</label>
      <input id={`sv-${key}`} className="form-control" required={required} value={f[key]} onChange={(e) => set({ [key]: e.target.value } as Partial<Service>)} />
      {help && <p className="help-block">{help}</p>}
    </div>
  );

  return (
    <>
      <form
        id="service-form"
        onSubmit={(e) => {
          e.preventDefault();
          trySave();
        }}
      >
        <PageHeader back="services" title={t("products_form")} actions={<HeaderButtons form="service-form" cancelTo="services" />} />
        <div id="content">
          <div className="row">
            <div className="col-xs-12 col-md-6">
              <div className="panel panel-default">
                <div className="panel-heading">{existing ? pname(existing) : t("new_product")}</div>
                <div className="panel-body">
                  <div className="form-group">
                    <label htmlFor="sv-family">{t("family")}</label>
                    <select id="sv-family" className="form-control" value="" disabled>
                      <option value="">{t("select_family")}</option>
                    </select>
                  </div>
                  {input("ref", t("sku"))}
                  {input("nameFr", t("name_fr"), t("name_fr_help"), true)}
                  {input("nameEn", t("name_en"), t("name_en_help"))}
                  {input("descFr", t("description_fr"), t("description_fr_help"))}
                  {input("descEn", t("description_en"), t("description_en_help"))}
                  <div className="form-group">
                    <label htmlFor="sv-price">{t("price")}</label>
                    <div className="input-group">
                      <input
                        id="sv-price"
                        className="form-control"
                        inputMode="decimal"
                        value={price}
                        onChange={(e) => {
                          dirty.current = true;
                          setPrice(e.target.value);
                        }}
                      />
                      <span className="input-group-addon">DH</span>
                    </div>
                  </div>
                  <div className="form-group">
                    <label htmlFor="sv-unit">{t("product_unit")}</label>
                    <select id="sv-unit" className="form-control" value="" disabled>
                      <option value="">{t("select_unit")}</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="sv-tax">{t("tax_rate")}</label>
                    <select id="sv-tax" className="form-control" value={f.taxId} onChange={(e) => set({ taxId: e.target.value })}>
                      {state.taxRates.map((r) => (
                        <option key={r.id} value={r.id}>
                          {taxLabel(r.id)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
            <div className="col-xs-12 col-md-6">
              <div className="panel panel-default">
                <div className="panel-heading">{t("extra_information")}</div>
                <div className="panel-body">
                  {input("provider", t("provider_name"))}
                  <div className="form-group">
                    <label htmlFor="sv-purchase">{t("purchase_price")}</label>
                    <div className="input-group">
                      <input
                        id="sv-purchase"
                        className="form-control"
                        inputMode="decimal"
                        value={purchase}
                        onChange={(e) => {
                          dirty.current = true;
                          setPurchase(e.target.value);
                        }}
                      />
                      <span className="input-group-addon">DH</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
      {similar && (
        <Dialog
          title={t("dup_title")}
          text={t("dup_text", { name: pname(similar) })}
          danger={false}
          confirmLabel={t("dup_create")}
          cancelLabel={t("dup_back")}
          onCancel={() => setSimilar(null)}
          onConfirm={() => {
            setSimilar(null);
            save();
          }}
        />
      )}
    </>
  );
}

export function Missing({ back }: { back: string }) {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t("not_found")} back={back} />
      <div id="content">
        <div className="alert alert-warning">{t("not_found_text")}</div>
      </div>
    </>
  );
}
