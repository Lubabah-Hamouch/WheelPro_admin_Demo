# Wheel Pro — interactive demo

A standalone, click-through demo of a garage invoicing and stock system: dashboard, service
catalogue, invoices (with live totals, payments and status), clients, stock with movement
history, reports, and settings. English and French throughout; light and dark themes; an
Admin / Staff role switch that changes what each screen shows.

**Every client, vehicle, supplier, price and invoice is invented.** All data lives in memory in the
browser tab; reloading the page starts again from the same fixtures.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/
```

## Deploy (Vercel)

```bash
npx vercel --prod
```

`vercel.json` pins the Vite preset (`npm run build`, output `dist`). Routing is hash-based
(`#/invoices/…`), so no rewrite rules are needed and any static host works.

## Layout

- `src/calc.ts` — invoice arithmetic (line discounts, whole-invoice discount with rounding remainder, VAT per rate, status from payments)
- `src/model.ts` — data types, invoice numbering, stock reconciliation on save
- `src/data.ts` — the fictional fixtures
- `src/store.tsx` — state, actions, hash routing, unsaved-changes guard
- `src/i18n.ts` — EN / FR strings (French is type-checked against English)
- `src/pages/` — one file per section
- `src/styles/` — design tokens, shell, components, Bootstrap 3 re-skin
