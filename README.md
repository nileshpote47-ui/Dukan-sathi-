# Dukan Sathi

An offline-first shop companion for small Indian retail shops (kirana / general stores).
Manage stock, make bills, keep the udhaar (credit) khata and see today's sales — on a phone or a desktop browser.

## Phase 1 features

See [`PHASE_1_PROMPT.yaml`](./PHASE_1_PROMPT.yaml) for the full spec.

- **Home** — today's sales, profit, payment split (cash / UPI / udhaar), pending udhaar, low-stock list, recent bills, backup export/import
- **Bill** — search and add products, edit quantities (decimals allowed, e.g. 1.5 kg), discount, cash / UPI / udhaar, quick-add customer, stock check, share the bill on WhatsApp, bill history
- **Stock** — add, edit and delete products with selling price, cost price, unit and low-stock alert level; margin shown while editing
- **Udhaar** — customers sorted by amount owed, per-customer ledger with running balance, record payments, WhatsApp payment reminder

Data is stored in the browser's `localStorage` on this device only. Use **Export backup** on the Home screen regularly.

### Offline and install

After the first visit the app loads with no internet: a service worker caches every file of the build.
On Android/Chrome use **Add to Home screen** / **Install app**; on iPhone use Safari's **Share → Add to Home Screen**.
Opening the app in two tabs is safe: each tab picks up the other's changes.

## Deploying

`npm run build` produces a static site in `dist/` with relative paths, so it can be hosted anywhere
(GitHub Pages, Netlify, Vercel, any web server), including from a sub-path. It must be served over HTTPS
(or `localhost`) for offline mode and installing to work.

## Development

```bash
npm install
npm run dev      # start the dev server
npm test         # run the domain logic tests (Vitest)
npm run build    # type-check and build to dist/
npm run lint     # oxlint
```

CI (`.github/workflows/ci.yml`) runs lint, tests and build on every push and pull request.

## Code layout

```
src/
  lib/
    types.ts      data model (money is stored as integer paise)
    money.ts      rupee parsing and en-IN formatting
    shop.ts       pure business logic: products, billing, udhaar ledger, dashboard, backup
    shop.test.ts  tests for the above
    useShop.ts    React state hook + localStorage persistence
  screens/        Dashboard, Billing, Stock, Customers
  App.tsx         header and bottom tab navigation
  main.tsx        entry point, registers the service worker
sw/service-worker.js   offline caching; vite.config.ts injects the list of built files
public/          icons and web app manifest
```

All business rules live in `src/lib/shop.ts` as pure functions, so a backend can replace
`useShop.ts` in Phase 2 without touching the rules or the screens.
