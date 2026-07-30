# Zacca frontend (pay.zacca.ai)

Vite + React + TypeScript landing page and live demo for the Zacca Credit
Intelligence API. See the repo root `README.md` for the full project
description and `../DEPLOY.md` for deploying this alongside the backend on
Coolify.

## What's here

- `src/components/Hero.tsx`, `HowItWorks.tsx` — positioning and product explanation.
- `src/components/Catalog.tsx` — live `GET /catalog` fetch from the backend.
- `src/components/TryItLive.tsx` — runs the real `402 -> sign -> pay -> 200` flow
  in the browser, using a pasted Hedera testnet private key
  (`src/lib/payClient.ts`). The key is used only in this tab, to locally sign a
  Hedera `TransferTransaction` via `@x402/hedera` -- it is never sent
  anywhere.
- `src/components/OnChainEvidence.tsx` — static list of verified contract
  addresses and transactions from the live deployment.
- `src/polyfills.ts` — a `Buffer` global shim required by the Hedera SDK in
  the browser (confirmed necessary by inspecting the production bundle;
  Vite doesn't polyfill Node globals automatically).

## Local development

```bash
npm install
npm run dev
```

The Vite dev server proxies `/catalog`, `/data`, and `/health` to
`http://localhost:4021` (see `vite.config.ts`), so the backend just needs to
be running locally (`npm run dev` at the repo root) -- no CORS setup needed
in dev.

## Production build

```bash
VITE_API_BASE_URL=https://pay-api.zacca.ai npm run build
```

`VITE_API_BASE_URL` is compiled into the bundle at build time (Vite env var
semantics), not read at runtime -- see `Dockerfile`, which takes it as a
build arg for exactly this reason.
