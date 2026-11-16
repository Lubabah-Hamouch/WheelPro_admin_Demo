import { useEffect, useMemo, useState } from "react";
import { AppUiCtx } from "./appui";
import { useI18n } from "./i18n";
import { isDocumentRoute, useStore } from "./store";
import { FactureDocument, LoginPage } from "./pages/Standalone";
import { Dialog, Dropdown, Fa, Link } from "./ui";
import { CreateInvoiceDialog } from "./pages/CreateInvoiceDialog";
import { Dashboard } from "./pages/Dashboard";
import { ServiceForm, Services } from "./pages/Services";
import { InvoiceList } from "./pages/Invoices";
import { InvoiceView } from "./pages/InvoiceView";
import { ClientForm, ClientList, ClientView } from "./pages/Clients";
import { PartForm, StockHistory, StockList } from "./pages/Stock";
import { ReportPage, ReportsIndex } from "./pages/Reports";
import { SettingsPage } from "./pages/Settings";

const NAV = [
  { seg: "dashboard", icon: "tachometer", label: "nav_dashboard" },
  { seg: "services", icon: "database", label: "nav_services" },
  { seg: "invoices", icon: "file-text", label: "nav_invoices" },
  { seg: "clients", icon: "users", label: "nav_clients" },
  { seg: "stock", icon: "cubes", label: "nav_stock" },
  { seg: "reports", icon: "bar-chart", label: "nav_reports" },
  { seg: "settings", icon: "cogs", label: "nav_settings", cap: "settings.manage" },
] as const;

/** Bootstrap 3 tooltips for anything carrying data-tip, placed below it like the top bar's icons. */
function Tooltips() {
  const [tip, setTip] = useState<{ text: string; top: number; left: number; el: HTMLElement } | null>(null);
  // A tooltip lasts only while its element is still there, visible and under the pointer — the
  // loader's close cross, say, fades away under a still mouse without any mouseout.
  useEffect(() => {
    if (!tip) return;
    const id = window.setInterval(() => {
      const el = tip.el;
      if (!el.isConnected || !el.matches(":hover") || getComputedStyle(el).visibility === "hidden" || !el.getClientRects().length) setTip(null);
    }, 150);
    return () => window.clearInterval(id);
  }, [tip]);
  useEffect(() => {
    const over = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest?.("[data-tip]") as HTMLElement | null;
      if (!el) return setTip(null);
      const r = el.getBoundingClientRect();
      setTip({ text: el.dataset.tip ?? "", top: r.bottom + 2, left: r.left + r.width / 2, el });
    };
    const hide = () => setTip(null);
    document.addEventListener("mouseover", over);
    document.addEventListener("scroll", hide, true);
    document.addEventListener("mousedown", hide);
    return () => {
      document.removeEventListener("mouseover", over);
      document.removeEventListener("scroll", hide, true);
      document.removeEventListener("mousedown", hide);
    };
  }, []);
  if (!tip || !tip.text) return null;
  return (
    <div className="tooltip bottom in wp-tip" role="tooltip" style={{ top: tip.top, left: tip.left }}>
      <div className="tooltip-arrow" />
      <div className="tooltip-inner">{tip.text}</div>
    </div>
  );
}

/** The one loading indicator: the mark on a dimmed page, fading in and out, with its close cross. */
function Loader() {
  const { loading, hideLoader } = useStore();
  const { t } = useI18n();
  return (
    <div id="fullpage-loader" className={loading ? "is-visible" : ""} aria-hidden={!loading}>
      <div className="loader-content">
        <img id="loader-icon" src="/img/loading.png" alt={t("loading")} className="wp-loader-mark" />
      </div>
      <div className="text-right">
        <button type="button" className="fullpage-loader-close btn btn-link" aria-label={t("close")} data-tip={t("close")} onClick={(e) => (e.currentTarget.blur(), hideLoader())}>
          <span aria-hidden="true">
            <i className="fa fa-close" />
          </span>
        </button>
      </div>
    </div>
  );
}

const FILTERED = new Set(["services", "invoices", "clients", "stock"]);

function Clock() {
  const { lang } = useI18n();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const locale = lang === "fr" ? "fr-FR" : "en-GB";
  return (
    <span className="wp-topbar-clock" aria-live="off">
      {now.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
      <strong>{now.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</strong>
    </span>
  );
}

function Page() {
  const { route } = useStore();
  const [a, b, c] = route.path;
  switch (a) {
    case "dashboard":
      return <Dashboard />;
    case "services":
      return b ? <ServiceForm id={b === "new" ? null : b} /> : <Services />;
    case "invoices":
      return b ? <InvoiceView id={b} /> : <InvoiceList />;
    case "clients":
      if (!b) return <ClientList />;
      if (b === "new") return <ClientForm id={null} />;
      return c === "edit" ? <ClientForm id={b} /> : <ClientView id={b} />;
    case "stock":
      if (!b) return <StockList />;
      if (b === "new") return <PartForm id={null} />;
      return c === "history" ? <StockHistory id={b} /> : <PartForm id={b} />;
    case "reports":
      return b ? <ReportPage slug={b} /> : <ReportsIndex />;
    case "settings":
      return <SettingsPage />;
    default:
      return <Dashboard />;
  }
}

/** Pages drawn without the app's chrome: the sign-in page and the printable documents. */
export function App() {
  const { route } = useStore();
  const [a, b, c] = route.path;
  if (a === "login")
    return (
      <>
        <LoginPage />
        <Tooltips />
        <Loader />
      </>
    );
  if (isDocumentRoute(route.path)) return a === "invoices" ? <FactureDocument id={b} /> : <ReportPage slug={b} key={c} />;
  return <Shell />;
}

function Shell() {
  const store = useStore();
  const { prefs, setPref, route, navigate, pendingNav, setPendingNav, confirmPending } = store;
  const { t } = useI18n();
  const section = route.path[0];
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [createFor, setCreateFor] = useState<string | null | undefined>(undefined);
  const [stripOpen, setStripOpen] = useState(true);

  const ui = useMemo(
    () => ({
      filter: filters[section] ?? "",
      setFilter: (v: string) => setFilters((f) => ({ ...f, [section]: v })),
      openCreateInvoice: (clientId?: string) => setCreateFor(clientId ?? null),
    }),
    [filters, section],
  );

  return (
    <AppUiCtx.Provider value={ui}>
      <aside className="wp-sidebar" id="wp-sidebar">
        <Link to="dashboard" className="wp-sidebar-brand" title="Wheel Pro">
          <img src="/logo-dark.png" alt="Wheel Pro" className="wp-logo-dark" width={505} height={225} />
          <img src="/logo-light.png" alt="Wheel Pro" className="wp-logo-light" width={505} height={225} />
        </Link>
        <nav className="wp-sidebar-nav" aria-label={t("navigation")}>
          <div className="wp-nav-label">{t("navigation")}</div>
          {NAV.filter((n) => !("cap" in n) || store.can(n.cap)).map((n) => (
            <Link key={n.seg} to={n.seg} className={`wp-nav-link${section === n.seg ? " is-active" : ""}`} title={t(n.label)}>
              <Fa name={n.icon} />
              <span className="wp-nav-text">{t(n.label)}</span>
            </Link>
          ))}
        </nav>
        <div className="wp-sidebar-foot">{t("sidebar_note")}</div>
      </aside>

      <div id="main-content">
        <header className="wp-topbar">
          <div className="wp-topbar-left">
            <button
              type="button"
              className="wp-burger"
              aria-label={t("toggle_sidebar")}
              data-tip={t("menu")}
              onClick={() => setPref("sidebar", prefs.sidebar === "open" ? "collapsed" : "open")}
            >
              <i className="fa fa-bars" />
            </button>
            {FILTERED.has(section) && route.path.length === 1 && (
              <form className="wp-topbar-filter" role="search" onSubmit={(e) => e.preventDefault()}>
                <input
                  type="search"
                  className="form-control"
                  placeholder={t(`filter_${section}` as "filter_invoices")}
                  aria-label={t(`filter_${section}` as "filter_invoices")}
                  value={ui.filter}
                  onChange={(e) => ui.setFilter(e.target.value)}
                />
              </form>
            )}
            <Clock />
          </div>

          <div className="wp-topbar-right">
            {store.can("admin.pages") && (
              <Dropdown wrapClass="wp-topbar-dropdown" toggleClass="wp-topbar-icon" right tip={t("nav_settings")} toggle={<i className="fa fa-cogs" />}>
                {(["custom_fields", "invoice_groups", "invoice_archive", "tax_rates", "user_accounts", "activity_log", "backups"] as const).map((k) => (
                  <li key={k} className="disabled">
                    <a href="#" onClick={(e) => e.preventDefault()} aria-disabled="true">
                      {t(`gear_${k}`)} <span className="wp-gear-note">· {t("not_in_demo")}</span>
                    </a>
                  </li>
                ))}
                <li className="divider" />
                <li>
                  <a href="#/settings" onClick={(e) => (e.preventDefault(), navigate("settings"))}>
                    {t("system_settings")}
                  </a>
                </li>
              </Dropdown>
            )}
            <Dropdown
              wrapClass="wp-topbar-dropdown"
              toggleClass="wp-topbar-icon"
              right
              tip={t("demo_user")}
              toggle={
                <>
                  <Fa name="user" fw={false} />
                  <span className={`wp-badge wp-role-pill ${prefs.role === "admin" ? "wp-badge--info" : "wp-badge--neutral"}`}>
                    {t(prefs.role === "admin" ? "role_admin" : "role_staff")}
                  </span>
                </>
              }
            >
              <li className="dropdown-header">{t("signed_in_as")}</li>
              <li className={prefs.role === "admin" ? "active" : ""}>
                <a href="#" onClick={(e) => (e.preventDefault(), setPref("role", "admin"))}>
                  <i className="fa fa-shield fa-margin" /> {t("role_admin")}
                </a>
              </li>
              <li className={prefs.role === "staff" ? "active" : ""}>
                <a href="#" onClick={(e) => (e.preventDefault(), setPref("role", "staff"))}>
                  <i className="fa fa-user fa-margin" /> {t("role_staff")}
                </a>
              </li>
              <li className="divider" />
              <li className="dropdown-header wp-dropdown-note">{t("role_switch_note")}</li>
            </Dropdown>

            <div className="wp-lang-switch" role="group" aria-label={t("language")}>
              {(["en", "fr"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  className={prefs.lang === l ? "is-active" : ""}
                  aria-pressed={prefs.lang === l}
                  data-tip={l === "en" ? "English" : "Français"}
                  onClick={() => setPref("lang", l)}
                >
                  {l.toUpperCase()}
                </button>
              ))}
            </div>

            <button
              type="button"
              className="wp-theme-toggle wp-topbar-icon"
              data-tip={t("theme_toggle")}
              aria-label={t("theme_toggle")}
              onClick={() => setPref("theme", prefs.theme === "dark" ? "light" : "dark")}
            >
              <i className="fa fa-moon-o wp-icon-dark" />
              <i className="fa fa-sun-o wp-icon-light" />
            </button>

            <a
              href="#/login"
              className="wp-topbar-icon"
              data-tip={t("logout")}
              aria-label={t("logout")}
              onClick={(e) => {
                e.preventDefault();
                navigate("login");
              }}
            >
              <i className="fa fa-power-off" />
            </a>
          </div>
        </header>

        {stripOpen && (
          <div className="wp-demo-strip" role="note">
            <Fa name="info-circle" />
            <span>{t("demo_strip")}</span>
            <button type="button" className="btn btn-link" onClick={() => setStripOpen(false)}>
              {t("dismiss")}
            </button>
          </div>
        )}

        <main>
          <Page />
        </main>
      </div>

      {createFor !== undefined && <CreateInvoiceDialog clientId={createFor} onClose={() => setCreateFor(undefined)} />}

      {pendingNav !== null && (
        <Dialog
          title={t("leave_title")}
          text={t("leave_text")}
          confirmLabel={t("leave_confirm")}
          cancelLabel={t("leave_stay")}
          onCancel={() => setPendingNav(null)}
          onConfirm={confirmPending}
        />
      )}
      <Tooltips />
      <Loader />
    </AppUiCtx.Provider>
  );
}
