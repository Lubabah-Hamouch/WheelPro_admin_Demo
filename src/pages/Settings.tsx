import { useState } from "react";
import { useI18n } from "../i18n";
import type { Lang, Settings } from "../model";
import { useGuard, useStore } from "../store";
import { Dialog, Fa, HeaderButtons, PageHeader } from "../ui";

type Tab = "general" | "invoices" | "taxes" | "company";

/**
 * Settings: header with Save, tabs straight under it, and each tab a centred column of panels.
 * Admin only (settings.manage): Staff has no menu item and a typed URL is refused.
 */
export function SettingsPage() {
  const { t } = useI18n();
  const allowed = useGuard("settings.manage", t("not_allowed"));
  return allowed ? <SettingsForm /> : null;
}

function SettingsForm() {
  const { state, prefs, setPref, actions, setFlash, dirty, navigate, showLoader } = useStore();
  const { t, taxLabel, statusLabel } = useI18n();
  const [tab, setTab] = useState<Tab>("general");
  const [f, setF] = useState<Settings>(state.settings);
  const [lang, setLang] = useState<Lang>(prefs.lang);
  const [resetting, setResetting] = useState(false);

  const set = (patch: Partial<Settings>) => {
    dirty.current = true;
    setF((x) => ({ ...x, ...patch }));
  };
  const setCo = (k: keyof Settings["company"], v: string) => set({ company: { ...f.company, [k]: v } });

  const field = (k: keyof Settings["company"], label: string, help?: string) => (
    <div className="col-xs-12 col-md-6" key={k}>
      <div className="form-group">
        <label htmlFor={`co-${k}`}>{label}</label>
        <input id={`co-${k}`} className="form-control" value={f.company[k]} onChange={(e) => setCo(k, e.target.value)} />
        {help && <p className="help-block">{help}</p>}
      </div>
    </div>
  );

  return (
    <>
    <form
      id="settings-form"
      onSubmit={(e) => {
        e.preventDefault();
        dirty.current = false;
        showLoader();
        actions.saveSettings(f);
        if (lang !== prefs.lang) setPref("lang", lang);
        setFlash({ tone: "success", text: t("settings_saved") });
      }}
    >
      <PageHeader title={t("nav_settings")} actions={<HeaderButtons form="settings-form" hideCancel />} />

      <ul className="nav nav-tabs nav-tabs-noborder">
        {(["general", "invoices", "taxes", "company"] as const).map((x) => (
          <li key={x} className={tab === x ? "active" : ""}>
            <a
              href={`#settings-${x}`}
              onClick={(e) => {
                e.preventDefault();
                setTab(x);
              }}
            >
              {t(`tab_${x}`)}
            </a>
          </li>
        ))}
      </ul>

      <div className="tab-content" style={{ padding: 15 }}>
        <div className="row">
          <div className="col-xs-12 col-md-8 col-md-offset-2">
            {tab === "general" && (
              <>
                <div className="panel panel-info">
                  <div className="panel-heading">
                    <Fa name="shield" /> {t("demo_panel_title")}
                  </div>
                  <div className="panel-body">
                    <p className="help-block" style={{ marginTop: 0 }}>
                      {t("demo_panel_intro")}
                    </p>
                    <div className="wp-settings-role" role="radiogroup" aria-label={t("demo_role_title")}>
                      {(["admin", "staff"] as const).map((r) => (
                        <label key={r} className={`wp-role-option${prefs.role === r ? " is-active" : ""}`}>
                          <input type="radio" name="role" checked={prefs.role === r} onChange={() => setPref("role", r)} />
                          <div>
                            <strong>{t(r === "admin" ? "role_admin" : "role_staff")}</strong>
                            <span>{t(r === "admin" ? "role_admin_desc" : "role_staff_desc")}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                    <div className="row" style={{ marginTop: 16 }}>
                      <div className="col-xs-12 col-md-6">
                        <div className="form-group">
                          <label>{t("theme")}</label>
                          <div>
                            <div className="btn-group" role="group">
                              {(["dark", "light"] as const).map((th) => (
                                <button
                                  key={th}
                                  type="button"
                                  className={`btn ${prefs.theme === th ? "btn-primary" : "btn-default"}`}
                                  aria-pressed={prefs.theme === th}
                                  onClick={() => setPref("theme", th)}
                                >
                                  <Fa name={th === "dark" ? "moon-o" : "sun-o"} /> {t(th === "dark" ? "theme_dark" : "theme_light")}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="col-xs-12 col-md-6">
                        <div className="form-group">
                          <label>{t("reset_title")}</label>
                          <div>
                            <button type="button" className="btn btn-default" onClick={() => setResetting(true)}>
                              <Fa name="undo" /> {t("reset_button")}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="panel panel-default">
                  <div className="panel-heading">{t("tab_general")}</div>
                  <div className="panel-body">
                    <div className="row">
                      <div className="col-xs-12 col-md-6">
                        <div className="form-group">
                          <label htmlFor="st-lang">{t("language")}</label>
                          <select
                            id="st-lang"
                            className="form-control"
                            value={lang}
                            onChange={(e) => {
                              dirty.current = true;
                              setLang(e.target.value as Lang);
                            }}
                          >
                            <option value="en">{t("lang_english")}</option>
                            <option value="fr">{t("lang_french")}</option>
                          </select>
                          <p className="help-block">{t("language_help")}</p>
                        </div>
                      </div>
                      <div className="col-xs-12 col-md-6">
                        <div className="form-group">
                          <label htmlFor="st-date">{t("date_format")}</label>
                          <select id="st-date" className="form-control" value={f.dateFormat} onChange={(e) => set({ dateFormat: e.target.value as Settings["dateFormat"] })}>
                            <option value="dmy">d/m/Y (31/12/2026)</option>
                            <option value="ymd">Y-m-d (2026-12-31)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="panel panel-default">
                  <div className="panel-heading">{t("amount_settings")}</div>
                  <div className="panel-body">
                    <div className="row">
                      <div className="col-xs-12 col-md-6">
                        <div className="form-group">
                          <label htmlFor="st-cur">{t("currency_symbol")}</label>
                          <input id="st-cur" className="form-control" value="DH" readOnly />
                        </div>
                      </div>
                      <div className="col-xs-12 col-md-6">
                        <div className="form-group">
                          <label htmlFor="st-place">{t("currency_symbol_placement")}</label>
                          <input id="st-place" className="form-control" value={t("after_amount_space")} readOnly />
                        </div>
                      </div>
                    </div>
                    <p className="help-block" style={{ marginBottom: 0 }}>
                      {t("currency_help")}
                    </p>
                  </div>
                </div>
              </>
            )}

            {tab === "invoices" && (
              <div className="panel panel-default">
                <div className="panel-heading">{t("tab_invoices")}</div>
                <div className="panel-body">
                  <div className="row">
                    <div className="col-xs-12 col-md-6">
                      <div className="form-group">
                        <label htmlFor="st-due">{t("due_after_days")}</label>
                        <input
                          id="st-due"
                          type="number"
                          min={0}
                          max={365}
                          className="form-control"
                          value={f.dueDays}
                          onChange={(e) => set({ dueDays: Math.max(0, Math.min(365, Number(e.target.value) || 0)) })}
                        />
                        <p className="help-block">{t("due_after_help")}</p>
                      </div>
                    </div>
                    <div className="col-xs-12 col-md-6">
                      <div className="form-group">
                        <label htmlFor="st-ro">{t("set_to_read_only")}</label>
                        <select id="st-ro" className="form-control" value={f.readOnlyFrom} onChange={(e) => set({ readOnlyFrom: e.target.value as Settings["readOnlyFrom"] })}>
                          {(["unpaid", "partial", "paid"] as const).map((s) => (
                            <option key={s} value={s}>
                              {statusLabel(s)}
                            </option>
                          ))}
                        </select>
                        <p className="help-block">{t("read_only_help")}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tab === "taxes" && (
              <div className="panel panel-default">
                <div className="panel-heading">{t("tab_taxes")}</div>
                <div className="panel-body">
                  <div className="row">
                    <div className="col-xs-12 col-md-6">
                      <div className="form-group">
                        <label htmlFor="st-tax">{t("default_tax")}</label>
                        <select id="st-tax" className="form-control" value={f.defaultTaxId} onChange={(e) => set({ defaultTaxId: e.target.value })}>
                          {state.taxRates.map((r) => (
                            <option key={r.id} value={r.id}>
                              {taxLabel(r.id)}
                            </option>
                          ))}
                        </select>
                        <p className="help-block">{t("default_tax_help")}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tab === "company" && (
              <>
                <p className="text-muted">{t("company_intro")}</p>
                <div className="panel panel-default">
                  <div className="panel-heading">{t("company_details")}</div>
                  <div className="panel-body">
                    <div className="row">
                      {field("name", t("co_name"))}
                      {field("activity", t("co_activity"), t("co_activity_help"))}
                      {field("address", t("co_address"))}
                      {field("city", t("co_city"))}
                      {field("phone", t("co_phone"))}
                      {field("email", t("co_email"))}
                    </div>
                  </div>
                </div>
                <div className="panel panel-default">
                  <div className="panel-heading">{t("company_identity")}</div>
                  <div className="panel-body">
                    <div className="row">
                      {field("ice", "ICE")}
                      {field("if", "IF")}
                      {field("rc", "RC")}
                      {field("patente", "Patente")}
                      {field("rib", "RIB")}
                      {field("cnss", "CNSS")}
                    </div>
                    <p className="help-block" style={{ marginBottom: 0 }}>
                      {t("company_help")}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </form>

      {resetting && (
        <Dialog
          title={t("reset_title")}
          text={t("reset_confirm")}
          confirmLabel={t("reset_button")}
          onCancel={() => setResetting(false)}
          onConfirm={() => {
            actions.resetDemo();
            setResetting(false);
            navigate("dashboard", true);
            setFlash({ tone: "success", text: t("reset_done") });
          }}
        />
      )}
    </>
  );
}
