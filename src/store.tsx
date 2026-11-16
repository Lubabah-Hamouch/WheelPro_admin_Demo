import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { addDays, computeInvoice, creditDue, isoDate, parse, r2, realLines, type Computed, type Invoice, type Payment } from "./calc";
import { buildState, emptyLine } from "./data";
import {
  can,
  computeAll,
  nextNumber,
  nowStamp,
  paymentError,
  standardizeAmount,
  type PaymentError,
  syncStock,
  uid,
  type Capability,
  type Client,
  type Lang,
  type Part,
  type Role,
  type Service,
  type Settings,
  type State,
  type Theme,
} from "./model";

export type FlashItem = { tone: "success" | "danger" | "warning" | "info"; text: string };
export type Flash = FlashItem | FlashItem[] | null;

/** What a save did, beyond saving: the notices the reloaded page shows. */
export type SaveOutcome = {
  negative: { partId: string; balance: number }[];
  payError: PaymentError | null;
  credit: { paid: number; total: number; credit: number } | null;
};
export type Route = { path: string[]; query: URLSearchParams };

type Prefs = { lang: Lang; theme: Theme; role: Role; sidebar: "open" | "collapsed" };

const read = (k: string) => {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    window.localStorage.setItem(k, v);
  } catch {
    /* private mode: the choice still holds for this visit */
  }
};

function parseHash(): Route {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [p, q] = raw.split("?");
  const path = p.split("/").filter(Boolean);
  return { path: path.length ? path : ["dashboard"], query: new URLSearchParams(q ?? "") };
}

/** A printable document's own address: #/invoices/:id/facture or #/reports/:slug/pdf. */
export const isDocumentRoute = (path: string[]) => (path[0] === "invoices" && path[2] === "facture") || (path[0] === "reports" && path[2] === "pdf");

const SNAPSHOT_KEY = "wpdemo-snapshot";

/**
 * The demo's data lives in the tab. A document opens in a new tab through an ordinary link, so
 * the click hands the current data over first; the document tab starts from it. Every other
 * load starts from the fixtures, as before.
 */
function initialState(today: string): State {
  if (isDocumentRoute(parseHash().path)) {
    try {
      const raw = window.localStorage.getItem(SNAPSHOT_KEY);
      if (raw) {
        const snap = JSON.parse(raw) as State;
        if (snap.today === today) return snap;
      }
    } catch {
      /* fall back to the fixtures */
    }
  }
  return buildState(today);
}

function useStoreValue() {
  const [today] = useState(() => isoDate(new Date()));
  const [state, setState] = useState<State>(() => initialState(today));
  const [prefs, setPrefs] = useState<Prefs>(() => ({
    lang: read("wpdemo-lang") === "en" ? "en" : "fr",
    theme: read("wpdemo-theme") === "light" ? "light" : "dark",
    role: read("wpdemo-role") === "staff" ? "staff" : "admin",
    sidebar: read("wpdemo-sidebar") === "collapsed" ? "collapsed" : "open",
  }));
  const [route, setRoute] = useState<Route>(parseHash);
  const [flashes, setFlashes] = useState<FlashItem[]>([]);
  const setFlash = useCallback((f: Flash) => setFlashes(f === null ? [] : Array.isArray(f) ? f : [f]), []);
  const flash = flashes;
  const [pendingNav, setPendingNav] = useState<string | null>(null);
  const dirty = useRef(false);
  const keepFlash = useRef(false);
  /** How many in-app steps the browser's history holds, so the back link can walk it. */
  const depth = useRef(0);
  const [loading, setLoading] = useState(false);
  const loaderTimer = useRef<number | undefined>(undefined);

  /** The one loading indicator: raised by every save, like the system this mirrors. */
  const showLoader = useCallback((ms = 450) => {
    setLoading(true);
    window.clearTimeout(loaderTimer.current);
    loaderTimer.current = window.setTimeout(() => setLoading(false), ms);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (prefs.theme === "light") root.setAttribute("data-theme", "light");
    else root.removeAttribute("data-theme");
    if (prefs.sidebar === "collapsed") root.setAttribute("data-sidebar", "collapsed");
    else root.removeAttribute("data-sidebar");
    root.lang = prefs.lang;
  }, [prefs]);

  useEffect(() => {
    const onHash = () => {
      dirty.current = false;
      setPendingNav(null);
      if (!keepFlash.current) setFlash(null);
      keepFlash.current = false;
      setRoute(parseHash());
      window.scrollTo({ top: 0 });
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("hashchange", onHash);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, []);

  const go = useCallback((to: string) => {
    dirty.current = false;
    setPendingNav(null);
    const target = `#/${to.replace(/^\/+/, "")}`;
    // The branded loader covers every page change, as it does when the real app follows a link.
    showLoader(320);
    if (window.location.hash === target) setRoute(parseHash());
    else {
      depth.current++;
      window.location.hash = target;
    }
  }, [showLoader]);

  /** Every in-app navigation passes here: with unsaved work it asks first, in the app's own dialog. */
  const navigate = useCallback(
    (to: string, keep = false) => {
      keepFlash.current = keep;
      if (!keep) setFlash(null);
      if (dirty.current) setPendingNav(to);
      else go(to);
    },
    [go],
  );

  /** The back arrow: one step back through history, or the fallback page when there is none. */
  const back = useCallback(
    (fallback: string) => {
      const leave = () => {
        showLoader(320);
        if (depth.current > 0) {
          depth.current--;
          dirty.current = false;
          window.history.back();
        } else go(fallback);
      };
      setFlash(null);
      if (dirty.current) setPendingNav(`__back__:${fallback}`);
      else leave();
    },
    [go, showLoader],
  );

  const confirmPending = useCallback(() => {
    const to = pendingNav;
    if (to === null) return;
    setPendingNav(null);
    dirty.current = false;
    if (to.startsWith("__back__:")) {
      const fallback = to.slice(9);
      if (depth.current > 0) {
        depth.current--;
        window.history.back();
      } else go(fallback);
    } else go(to);
  }, [pendingNav, go]);

  const setPref = useCallback(<K extends keyof Prefs>(k: K, v: Prefs[K]) => {
    setPrefs((p) => ({ ...p, [k]: v }));
    write(`wpdemo-${k}`, String(v));
  }, []);

  const computed = useMemo(() => computeAll(state), [state]);

  // The invoice actions answer with what happened (a number, a refusal, warnings), so they work
  // on the latest state synchronously rather than inside a deferred update.
  const stateRef = useRef(state);
  stateRef.current = state;
  const commit = (next: State) => {
    stateRef.current = next;
    setState(next);
  };

  const actions = useMemo(() => {
    const by = () => prefs.role;

    /** Saves the invoice; issuing gives it the next number. Stock reconciles on every save. */
    const commitInvoice = (s: State, inv: Invoice, at: string): { s: State; inv: Invoice } => {
      const prev = s.invoices.find((i) => i.id === inv.id);
      let next = { ...inv, lines: inv.lines.filter((l) => l.name.trim() !== "") };
      // Issuing takes the next number; a number typed on the draft is kept unless another invoice has it.
      const taken = (n: string | null) => !!n && s.invoices.some((i) => i.id !== inv.id && i.number === n);
      if (next.issued && (!next.number || taken(next.number))) next = { ...next, number: nextNumber(s.invoices, next.date) };
      if (prev?.issued) next = { ...next, issued: true, number: prev.number };
      const invoices = prev ? s.invoices.map((i) => (i.id === inv.id ? next : i)) : [...s.invoices, next];
      const s2 = { ...s, invoices };
      return { s: { ...s2, ...syncStock(s2, next, at, by()) }, inv: next };
    };

    return {
      /**
       * Saves the invoice; stock reconciles. Then "record a payment now", if ticked, goes through
       * the same rules as any payment — a refused payment does not undo the save, it is reported.
       * Last, an invoice whose total has fallen below what was already paid is flagged.
       */
      saveInvoice(inv: Invoice, payNow?: { amount: string; date: string; method: Payment["method"] }): SaveOutcome {
        const s0 = stateRef.current;
        const at = nowStamp(s0.today);
        let r = commitInvoice(s0, inv, at);
        const negative = r.s.parts
          .filter((p) => p.qty < 0 && (s0.parts.find((x) => x.id === p.id)?.qty ?? 0) !== p.qty)
          .map((p) => ({ partId: p.id, balance: p.qty }));
        let payError: PaymentError | null = null;
        if (payNow && payNow.amount.trim() !== "") {
          const c = computeInvoice(r.inv, s0.today);
          const amount = r2(standardizeAmount(payNow.amount));
          payError = paymentError(c.total, c.balance, amount, payNow.date);
          if (!payError) {
            const paid = { ...r.inv, issued: true, payments: [...r.inv.payments, { amount, date: payNow.date, method: payNow.method, id: uid("pay") }] };
            r = commitInvoice(r.s, paid, at);
          }
        }
        const c = computeInvoice(r.inv, s0.today);
        const due = creditDue(c);
        commit(r.s);
        return { negative, payError, credit: due === null ? null : { paid: c.paid, total: c.total, credit: due } };
      },

      /** Enter Payment / Mark as Paid, against the stored invoice. Paying a draft issues it. */
      addPayment(invoiceId: string, amountText: string, date: string, method: Payment["method"]): PaymentError | null {
        const s0 = stateRef.current;
        const inv = s0.invoices.find((i) => i.id === invoiceId);
        if (!inv) return "invoice";
        const c = computeInvoice(inv, s0.today);
        const amount = r2(standardizeAmount(amountText));
        const err = paymentError(c.total, c.balance, amount, date);
        if (err) return err;
        let next = { ...inv, payments: [...inv.payments, { id: uid("pay"), amount, date, method }] };
        if (!inv.issued) next = { ...next, issued: true, number: nextNumber(s0.invoices, inv.date) };
        commit({ ...s0, invoices: s0.invoices.map((i) => (i.id === invoiceId ? next : i)) });
        return null;
      },

      /**
       * A credit note (avoir): a new draft for the same client, dated today, carrying the
       * invoice's lines with negative quantities. The invoice it credits becomes read-only.
       */
      createCredit(sourceId: string): string {
        const s0 = stateRef.current;
        const src = s0.invoices.find((i) => i.id === sourceId)!;
        const id = uid("inv");
        const neg = (v: string) => (parse(v) === 0 ? v : String(-parse(v)));
        const credit: Invoice = {
          ...src,
          id,
          number: null,
          date: s0.today,
          due: addDays(s0.today, s0.settings.dueDays),
          issued: false,
          payments: [],
          includeCnss: false,
          includeRib: false,
          creditParentId: sourceId,
          locked: false,
          discount: src.discount.unit === "amount" ? { ...src.discount, value: neg(src.discount.value) } : src.discount,
          lines: realLines(src).map((l) => ({ ...l, key: emptyLine().key, qty: neg(l.qty) })),
          seq: s0.invoices.length + 1,
        };
        commit({ ...s0, invoices: [...s0.invoices.map((i) => (i.id === sourceId ? { ...i, locked: true } : i)), credit] });
        return id;
      },

      deletePayment(invoiceId: string, paymentId: string) {
        setState((s) => ({
          ...s,
          invoices: s.invoices.map((i) => (i.id === invoiceId ? { ...i, payments: i.payments.filter((p) => p.id !== paymentId) } : i)),
        }));
      },

      createInvoice(clientId: string, date: string): string {
        const id = uid("inv");
        setState((s) => ({
          ...s,
          invoices: [
            ...s.invoices,
            {
              id,
              number: null,
              clientId,
              date,
              due: addDays(date, s.settings.dueDays),
              issued: false,
              vehicle: "",
              includeCnss: false,
              includeRib: false,
              creditParentId: null,
              locked: false,
              discount: { unit: "percent", value: "" },
              lines: [],
              payments: [],
              seq: s.invoices.length + 1,
            },
          ],
        }));
        return id;
      },

      copyInvoice(source: Invoice, clientId: string, date: string): string {
        const id = uid("inv");
        setState((s) => ({
          ...s,
          invoices: [
            ...s.invoices,
            {
              ...source,
              id,
              number: null,
              clientId,
              date,
              due: addDays(date, s.settings.dueDays),
              issued: false,
              payments: [],
              includeCnss: false,
              includeRib: false,
              creditParentId: null,
              locked: false,
              lines: source.lines.map((l) => ({ ...l, key: emptyLine().key })),
              seq: s.invoices.length + 1,
            },
          ],
        }));
        return id;
      },

      /** Only a draft can be deleted. What it had set aside goes back to stock first. */
      deleteInvoice(id: string) {
        const s0 = stateRef.current;
        const inv = s0.invoices.find((i) => i.id === id);
        if (!inv || inv.issued) return;
        const released = syncStock(s0, { ...inv, lines: [] }, nowStamp(s0.today), by());
        commit({ ...s0, ...released, invoices: s0.invoices.filter((i) => i.id !== id) });
      },

      saveClient(c: Client): string {
        const id = c.id || uid("c");
        setState((s) => ({
          ...s,
          clients: s.clients.some((x) => x.id === id) ? s.clients.map((x) => (x.id === id ? { ...c, id } : x)) : [...s.clients, { ...c, id }],
        }));
        return id;
      },

      toggleClientActive(id: string) {
        setState((s) => ({ ...s, clients: s.clients.map((c) => (c.id === id ? { ...c, active: !c.active } : c)) }));
      },

      /** Refused while the client has invoices: deleting it would orphan issued factures. */
      deleteClient(id: string) {
        setState((s) => (s.invoices.some((i) => i.clientId === id) ? s : { ...s, clients: s.clients.filter((c) => c.id !== id) }));
      },

      saveService(sv: Service): string {
        const id = sv.id || uid("s");
        setState((s) => ({
          ...s,
          services: s.services.some((x) => x.id === id) ? s.services.map((x) => (x.id === id ? { ...sv, id } : x)) : [...s.services, { ...sv, id }],
        }));
        return id;
      },

      deleteService(id: string) {
        setState((s) => ({ ...s, services: s.services.filter((x) => x.id !== id) }));
      },

      /** A new part logs its opening stock; changing the level on the form logs an edit. */
      savePart(p: Part): string {
        const id = p.id || uid("p");
        setState((s) => {
          const prev = s.parts.find((x) => x.id === id);
          const at = nowStamp(s.today);
          const movements = [...s.movements];
          if (!prev) movements.push({ id: uid("mv"), partId: id, at, change: p.qty, balance: p.qty, reason: "initial", invoiceId: null, by: by() });
          else if (prev.qty !== p.qty)
            movements.push({ id: uid("mv"), partId: id, at, change: p.qty - prev.qty, balance: p.qty, reason: "edit", invoiceId: null, by: by() });
          // Staff never sees the cost, so a Staff save leaves it as it was.
          const cost = by() === "admin" ? p.cost : (prev?.cost ?? null);
          const part = { ...p, id, cost };
          return { ...s, movements, parts: prev ? s.parts.map((x) => (x.id === id ? part : x)) : [...s.parts, part] };
        });
        return id;
      },

      adjustPart(id: string, change: number) {
        setState((s) => {
          const part = s.parts.find((p) => p.id === id);
          if (!part) return s;
          const balance = part.qty + change;
          return {
            ...s,
            parts: s.parts.map((p) => (p.id === id ? { ...p, qty: balance } : p)),
            movements: [...s.movements, { id: uid("mv"), partId: id, at: nowStamp(s.today), change, balance, reason: "adjust", invoiceId: null, by: by() }],
          };
        });
      },

      deletePart(id: string) {
        setState((s) => ({ ...s, parts: s.parts.filter((p) => p.id !== id), movements: s.movements.filter((m) => m.partId !== id) }));
      },

      saveSettings(settings: Settings) {
        setState((s) => ({ ...s, settings }));
      },

      resetDemo() {
        dirty.current = false;
        setState(buildState(today));
      },
    };
  }, [prefs.role, today]);

  /** Hands the tab's data to a document about to open in a new tab. */
  const snapshot = useCallback(() => write(SNAPSHOT_KEY, JSON.stringify(stateRef.current)), []);

  const hideLoader = useCallback(() => {
    window.clearTimeout(loaderTimer.current);
    setLoading(false);
  }, []);

  return {
    state,
    computed,
    snapshot,
    hideLoader,
    prefs,
    setPref,
    route,
    navigate,
    back,
    confirmPending,
    loading,
    showLoader,
    can: (cap: Capability) => can(prefs.role, cap),
    flash,
    setFlash,
    dirty,
    pendingNav,
    setPendingNav,
    go,
    actions,
  };
}

export type Store = ReturnType<typeof useStoreValue>;
const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const value = useStoreValue();
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}

/** Totals for one client's issued invoices. */
export function clientTotals(state: State, computed: Map<string, Computed>, clientId: string) {
  let count = 0;
  let billed = 0;
  let balance = 0;
  for (const inv of state.invoices) {
    if (inv.clientId !== clientId) continue;
    count++;
    if (!inv.issued) continue;
    const c = computed.get(inv.id) ?? computeInvoice(inv, state.today);
    billed += c.total;
    balance += c.balance;
  }
  return { count, billed: r2(billed), balance: r2(balance) };
}

/**
 * An Admin-only page refuses a role without the capability: back to the dashboard, saying why.
 * Hiding the menu item is a courtesy; this is the rule, so a typed URL is refused too.
 */
export function useGuard(cap: Capability, notAllowed: string) {
  const store = useStore();
  const allowed = store.can(cap);
  useEffect(() => {
    if (!allowed) {
      store.navigate("dashboard", true);
      store.setFlash({ tone: "warning", text: notAllowed });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed]);
  return allowed;
}
