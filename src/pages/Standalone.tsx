import { useEffect, useState } from "react";
import { factureHtml, showDocument } from "../documents";
import { useI18n } from "../i18n";
import { useStore } from "../store";

/** #/invoices/:id/facture — the facture as this tab's whole page. */
export function FactureDocument({ id }: { id: string }) {
  const { state } = useStore();
  const { t } = useI18n();
  const inv = state.invoices.find((i) => i.id === id);
  useEffect(() => {
    if (inv) showDocument(factureHtml(state, inv, t("print")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (inv) return null;
  return (
    <div className="wp-login-page">
      <div id="login">
        <img src="/logo-dark.png" alt="Wheel Pro" className="login-logo wp-logo-dark" />
        <img src="/logo-light.png" alt="Wheel Pro" className="login-logo wp-logo-light" />
        <div className="alert alert-warning">{t("document_missing")}</div>
        <a className="btn btn-primary" href="#/invoices">
          {t("nav_invoices")}
        </a>
      </div>
    </div>
  );
}

/**
 * The sign-in page, as the real one draws it: the logo on its own card, a floating theme toggle,
 * email and password, Login and "I forgot my password". Any credentials open the demo.
 */
export function LoginPage() {
  const { prefs, setPref, go } = useStore();
  const { t } = useI18n();
  const [email, setEmail] = useState("demo@wheelpro.example.com");
  const [password, setPassword] = useState("demo");
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    document.title = `Wheel Pro - ${t("login")}`;
    return () => {
      document.title = "Wheel Pro";
    };
  }, [t]);
  return (
    <div className="wp-login-page">
      <button
        type="button"
        className="wp-theme-toggle wp-theme-toggle--floating"
        data-tip={t("theme_toggle")}
        aria-label={t("theme_toggle_aria")}
        onClick={() => setPref("theme", prefs.theme === "dark" ? "light" : "dark")}
      >
        <i className="fa fa-moon-o wp-icon-dark" />
        <i className="fa fa-sun-o wp-icon-light" />
      </button>
      <div className="container">
        <div id="login" className="col-sm-8 col-sm-offset-2 col-md-6 col-md-offset-3">
          <img src="/logo-dark.png" alt="Wheel Pro" className="login-logo wp-logo-dark" />
          <img src="/logo-light.png" alt="Wheel Pro" className="login-logo wp-logo-light" />
          {note && <div className="alert alert-info">{note}</div>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              go("dashboard");
            }}
          >
            <div className="form-group">
              <label htmlFor="email" className="control-label">
                {t("email")}
              </label>
              <input type="email" id="email" className="form-control" placeholder={t("email")} required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="password" className="control-label">
                {t("password")}
              </label>
              <input type="password" id="password" className="form-control" placeholder={t("password")} required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary">
              <i className="fa fa-unlock fa-margin" /> {t("login")}
            </button>
            <button type="button" className="btn btn-default" onClick={() => setNote(t("reset_not_in_demo"))}>
              {t("forgot_your_password")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
