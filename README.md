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

## Development

```bash
npm install
npm run dev      # start the dev server
npm test         # run the domain logic tests (Vitest)
npm run build    # type-check and build to dist/
npm run lint     # oxlint
```

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
```

All business rules live in `src/lib/shop.ts` as pure functions, so a backend can replace
`useShop.ts` in Phase 2 without touching the rules or the screens.
