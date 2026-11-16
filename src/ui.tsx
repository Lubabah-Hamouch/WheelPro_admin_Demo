import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { creditDue, type Computed } from "./calc";
import { useI18n } from "./i18n";
import { useStore } from "./store";

export const Fa = ({ name, fw = true, spin }: { name: string; fw?: boolean; spin?: boolean }) => (
  <i className={`fa ${fw ? "fa-fw " : ""}fa-${name}${spin ? " fa-spin" : ""}`} aria-hidden="true" />
);

export function Badge({ tone, children, title }: { tone?: string; children: ReactNode; title?: string }) {
  return (
    <span className={`wp-badge${tone ? ` wp-badge--${tone}` : ""}`} title={title}>
      {children}
    </span>
  );
}

/** Status, then "Overdue" and "Credit due" beside it where they apply. Tone comes from the status, never the label. */
export function StatusBadge({ c, hideDraft }: { c: Computed; hideDraft?: boolean }) {
  const { t, statusLabel, money } = useI18n();
  const credit = creditDue(c);
  return (
    <>
      {!(hideDraft && c.status === "draft") && <Badge tone={c.status}>{statusLabel(c.status)}</Badge>}
      {c.overdue && (
        <>
          {" "}
          <Badge tone="overdue">{t("overdue")}</Badge>
        </>
      )}
      {credit !== null && (
        <>
          {" "}
          <Badge tone="credit" title={t("credit_amount", { amount: money(credit) })}>
            {t("credit_due")}
          </Badge>
        </>
      )}
    </>
  );
}

/** An in-app link: a real href (so it can open in a new tab), routed through the leave guard. */
export function Link({ to, className, children, title }: { to: string; className?: string; children: ReactNode; title?: string }) {
  const { navigate } = useStore();
  return (
    <a
      href={`#/${to}`}
      className={className}
      title={title}
      onClick={(e: MouseEvent) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        e.stopPropagation();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

/**
 * A link to a printable document. A real link opening a new tab — never a scripted window — so
 * no pop-up blocker is ever involved; clicking it hands the tab's data to the document first.
 * No loader either: the document opens elsewhere and this page stays as it is.
 */
export function DocLink({ to, className, children, role }: { to: string; className?: string; children: ReactNode; role?: string }) {
  const { snapshot } = useStore();
  return (
    <a href={`#/${to}`} target="_blank" rel="noopener" className={className} role={role} onClick={() => snapshot()}>
      {children}
    </a>
  );
}

/** The back arrow walks the browser's own history; its href is the fallback when there is none. */
function BackLink({ fallback, label }: { fallback: string; label: string }) {
  const { back } = useStore();
  return (
    <a
      href={`#/${fallback}`}
      className="wp-back"
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return;
        e.preventDefault();
        back(fallback);
      }}
    >
      <Fa name="arrow-left" fw={false} /> {label}
    </a>
  );
}

/** The Save / Cancel pair every form page carries in its header. Cancel steps back, like the real one. */
export function HeaderButtons({ form, cancelTo, hideCancel }: { form: string; cancelTo?: string; hideCancel?: boolean }) {
  const { t } = useI18n();
  const { back } = useStore();
  return (
    <div className="btn-group btn-group-sm">
      <button type="submit" form={form} className="btn btn-success">
        <i className="fa fa-check" /> {t("save")}
      </button>
      {!hideCancel && (
        <button type="button" className="btn btn-danger" onClick={() => back(cancelTo ?? "dashboard")}>
          <i className="fa fa-times" /> {t("cancel")}
        </button>
      )}
    </div>
  );
}

export function PageHeader({
  title,
  sub,
  back,
  actions,
  extra,
}: {
  title: ReactNode;
  sub?: ReactNode;
  back?: string;
  actions?: ReactNode;
  extra?: ReactNode;
}) {
  const { t } = useI18n();
  const heading = (
    <h1 className="wp-page-header-title">
      {title}
      {extra}
      {sub && <span className="wp-page-header-sub">{sub}</span>}
    </h1>
  );
  // Messages sit under the page header, at the top of the content, as the layout's alerts do.
  return (
    <>
    <div className="wp-page-header">
      {back ? (
        <div className="wp-page-header-title-group">
          <BackLink fallback={back} label={t("back")} />
          {heading}
        </div>
      ) : (
        heading
      )}
      {actions && <div className="wp-page-header-actions">{actions}</div>}
    </div>
    <FlashMessage />
    </>
  );
}

/** Bootstrap 3 dropdown: the menu shows while its parent carries .open. Closes on any outside click. */
export function Dropdown({
  toggle,
  toggleClass = "btn btn-default btn-sm dropdown-toggle",
  wrapClass = "btn-group",
  right,
  title,
  tip,
  children,
}: {
  toggle: ReactNode;
  toggleClass?: string;
  wrapClass?: string;
  right?: boolean;
  title?: string;
  tip?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div className={`${wrapClass}${open ? " open" : ""}`} ref={ref} onClick={(e) => e.stopPropagation()}>
      <button type="button" className={toggleClass} aria-haspopup="true" aria-expanded={open} title={title} aria-label={tip ?? title} data-tip={open ? undefined : tip} onClick={() => setOpen((o) => !o)}>
        {toggle}
      </button>
      <ul className={`dropdown-menu${right ? " dropdown-menu-right" : ""}`} onClick={() => setOpen(false)}>
        {children}
      </ul>
    </div>
  );
}

export function MenuItem({ icon, onClick, children, danger }: { icon: string; onClick: () => void; children: ReactNode; danger?: boolean }) {
  return (
    <li className={danger ? "is-danger" : undefined}>
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          onClick();
        }}
      >
        <i className={`fa fa-${icon} fa-margin`} /> {children}
      </a>
    </li>
  );
}

/** The one confirmation dialog. */
export function Dialog({
  title,
  text,
  children,
  confirmLabel,
  cancelLabel,
  danger = true,
  confirmDisabled,
  onConfirm,
  onCancel,
  extra,
  wide,
}: {
  title?: ReactNode;
  text?: ReactNode;
  children?: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel?: ReactNode;
  danger?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  extra?: ReactNode;
  wide?: boolean;
}) {
  const { t } = useI18n();
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onCancel]);
  return (
    <div className="wp-confirm" role="dialog" aria-modal="true">
      <div className="wp-confirm-backdrop" onMouseDown={onCancel} />
      <form
        className={`wp-confirm-box${wide ? " wp-confirm-box--wide" : ""}`}
        onSubmit={(e) => {
          e.preventDefault();
          if (!confirmDisabled) onConfirm();
        }}
      >
        {title && <h2 className="wp-confirm-title">{title}</h2>}
        {text && <p className="wp-confirm-text">{text}</p>}
        {children}
        <div className="wp-confirm-actions">
          <button type="button" className="btn btn-default" onClick={onCancel}>
            {cancelLabel ?? t("cancel")}
          </button>
          {extra}
          <button type="submit" className={`btn ${danger ? "btn-danger" : "btn-primary"}`} disabled={confirmDisabled} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

export type Sort = { key: string; dir: "asc" | "desc" };

export function useSort(initial: Sort) {
  return useState<Sort>(initial);
}

/** Clicking the active column reverses it. */
export function SortTh({
  id,
  label,
  sort,
  setSort,
  amount,
  defaultDir = "asc",
}: {
  id: string;
  label: ReactNode;
  sort: Sort;
  setSort: (s: Sort) => void;
  amount?: boolean;
  defaultDir?: "asc" | "desc";
}) {
  const active = sort.key === id;
  const icon = !active ? "sort" : sort.dir === "asc" ? "sort-asc" : "sort-desc";
  return (
    <th
      className={`wp-sort${active ? " is-sorted" : ""}${amount ? " amount" : ""}`}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button type="button" onClick={() => setSort(active ? { key: id, dir: sort.dir === "asc" ? "desc" : "asc" } : { key: id, dir: defaultDir })}>
        {label}
        <i className={`fa fa-${icon}`} aria-hidden="true" />
      </button>
    </th>
  );
}

export function cmp(a: string | number, b: string | number) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "fr", { sensitivity: "base", numeric: true });
}

export function sorted<T>(rows: T[], sort: Sort, value: (row: T, key: string) => string | number) {
  const m = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => m * cmp(value(a, sort.key), value(b, sort.key)));
}

const ALERT_ORDER = { success: 0, info: 1, warning: 2, danger: 3 } as const;
const ALERT_ICON = { success: "info-circle", info: "info-circle", warning: "exclamation-circle", danger: "warning" } as const;

/** The page's alerts, as the layout draws them: success, info, warning, error — each with its icon. */
export function FlashMessage() {
  const { flash, setFlash } = useStore();
  if (!flash.length) return null;
  const ordered = flash.map((f, i) => ({ f, i })).sort((a, b) => ALERT_ORDER[a.f.tone] - ALERT_ORDER[b.f.tone] || a.i - b.i);
  return (
    <>
      {ordered.map(({ f, i }) => (
        <div key={i} className={`alert alert-${f.tone} alert-dismissible wp-flash`} role="alert">
          <button type="button" className="close" aria-label="Close" onClick={() => setFlash(flash.filter((_, j) => j !== i))}>
            <span aria-hidden="true">×</span>
          </button>
          <i className={`fa fa-fw fa-lg fa-${ALERT_ICON[f.tone]}`} />
          <span>{f.text}</span>
        </div>
      ))}
    </>
  );
}

/**
 * A Bootstrap 3 modal, the markup the app's own dialogs use: a header with the close cross, the
 * body, and a footer whose button group is Submit (green) then Cancel (red).
 */
export function Modal({
  title,
  children,
  onClose,
  onSubmit,
  submitLabel,
  submitIcon = "check",
  submitClass = "btn-success",
  cancelClass = "btn-danger",
  busy,
  large,
  headingTag = "h4",
}: {
  title: ReactNode;
  children: ReactNode;
  onClose: () => void;
  onSubmit?: () => void;
  submitLabel?: ReactNode;
  submitIcon?: string;
  submitClass?: string;
  cancelClass?: string;
  busy?: boolean;
  large?: boolean;
  headingTag?: "h3" | "h4";
}) {
  const { t } = useI18n();
  useEffect(() => {
    const esc = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    document.body.classList.add("modal-open");
    return () => {
      document.removeEventListener("keydown", esc);
      document.body.classList.remove("modal-open");
    };
  }, [onClose]);
  const Heading = headingTag;
  return (
    <>
      <div className="modal-backdrop in" />
      <div className="modal in wp-modal" role="dialog" aria-modal="true" style={{ display: "block" }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <div className={`modal-dialog${large ? " modal-lg" : ""}`}>
          <form
            className="modal-content"
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy) onSubmit?.();
            }}
          >
            <div className="modal-header">
              <button type="button" className="close" aria-label={t("cancel")} onClick={onClose}>
                <i className="fa fa-close" />
              </button>
              <Heading className={headingTag === "h4" ? "panel-title" : "modal-title"}>{title}</Heading>
            </div>
            <div className="modal-body">{children}</div>
            <div className="modal-footer">
              <div className="btn-group">
                {onSubmit && (
                  <button type="submit" className={`btn ${submitClass}`} disabled={busy}>
                    <i className={`fa fa-${submitIcon}`} /> {submitLabel ?? t("submit")}
                  </button>
                )}
                <button type="button" className={`btn ${cancelClass}`} onClick={onClose}>
                  <i className="fa fa-times" /> {t("cancel")}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

/** The "left empty" mark: a muted em dash, never a blank cell. 0 is a value, not an empty. */
export const Blank = () => <span className="wp-empty">—</span>;
export const orBlank = (v: string | null | undefined) => (v && v.trim() ? v : <Blank />);

/** A table row that opens its item. Anything interactive inside keeps its own click. */
export function rowLink(navigate: (to: string) => void, to: string) {
  return {
    "data-href": `#/${to}`,
    tabIndex: 0,
    onClick: (e: MouseEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("a,button,input,select,label,.btn-group,form")) return;
      navigate(to);
    },
    onKeyDown: (e: ReactKeyboardEvent) => {
      if (e.key === "Enter" && e.target === e.currentTarget) navigate(to);
    },
  };
}
