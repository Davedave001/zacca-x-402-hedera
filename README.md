# Zacca.ai Credit Intelligence API — x402 on Hedera

Pay-per-query credit scoring for African MSMEs, settled on Hedera testnet (HBAR).
Submission for the Hedera x402 bounty ("Build the internet's payment layer").

This is a real Zacca.ai product component, not a bounty-only demo: the **Credit
Intelligence API** described in Zacca's technical build outline, wired into the
x402 resource-server pattern. An agent — a lender's underwriting agent, a
borrower-facing app, or any autonomous buyer — pays per call in HBAR and gets
back a Dynamic Credit Score (DCS), a Verified-Business-Record check, or a full
risk/credit-limit assessment, with no accounts, invoices, or subscriptions.

Forked from the Hedera bounty reference architecture
([matevszm/x402-hedera-example](https://github.com/matevszm/x402-hedera-example)),
which supplies the x402 + Hedera plumbing (Hono server, `blocky402` facilitator,
delegated-signing client). The `DataProvider` swapped in here —
`CreditScoreProvider` — is genuinely Zacca's own scoring logic.

## Catalog

| product | params | price | what it returns |
|---|---|---|---|
| `vbr-lookup` | `businessId` | 0.01 HBAR | whether the business has a Verified Business Record |
| `dcs-score` | `businessId` | 0.02 HBAR | Dynamic Credit Score (0-100) and risk tier |
| `credit-limit` | `businessId` | 0.05 HBAR | full assessment: DCS, probability of default, recommended credit limit, max tenure |

`GET /catalog` returns the live catalog and pricing.

## Scoring logic — Stage 1 (cold-start, rule-based)

`src/core/dcs-scoring.ts` implements Zacca's Stage 1 methodology from the
original concept paper: cash-flow, stability, customer-behaviour and
operational features combine into a 0-100 DCS score, a risk tier, and
`Credit Limit = Monthly Turnover x Risk Multiplier`. No historical default
data is required — this is exactly the rule-based fallback the concept paper
specifies for a company with no loan-outcome history yet.

For this demo, features are deterministically derived from the `businessId`
(same seeded-PRNG technique as the reference `MockDataProvider`) so the
provider is self-contained and reproducible without a live data pipeline.

**Production swap point:** replace `syntheticFeaturesFor()` in
`dcs-scoring.ts` with a real lookup against the Zacca VBR Data Rail
(Chat-to-Credit pipeline output). Nothing else — the provider, the catalog,
the server wiring — needs to change. Same "swap the provider" pattern the
reference architecture demonstrates with `MockDataProvider`.

## Architecture

- `src/core/provider.ts` — the `DataProvider` contract (unchanged from reference).
- `src/core/dcs-scoring.ts` — **Zacca's scoring engine** (the real deliverable).
- `src/providers/credit/credit-provider.ts` — `CreditScoreProvider`, the x402-facing wrapper.
- `src/providers/mock/` — original reference `MockDataProvider`, kept for comparison.
- `src/server/` — Hono app: pre-validation -> `paymentMiddleware` -> handler (unchanged).
- `scripts/e2e-pay.ts` — live client running the full `402 -> pay -> 200` flow against `dcs-score`.

Swap data source: one line in `src/providers/index.ts` (`DATA_PROVIDER=zacca-credit` vs `mock`).
Swap facilitator: change `FACILITATOR_URL`.

## Setup

Requires Node.js >=20.

1. `npm install`
2. Copy `.env.example` to `.env`; set `PAY_TO_ACCOUNT` (receiver, account id only),
   `HEDERA_CLIENT_ID` / `HEDERA_CLIENT_KEY` (funded testnet payer account).
   **`PAY_TO_ACCOUNT` must be a different account than `HEDERA_CLIENT_ID`** — a
   Hedera `TransferTransaction` nets same-account transfers to zero, so paying
   yourself settles as a 0-amount transfer and the facilitator rejects it as
   an amount mismatch.

### API server
- `npm run dev` — start with hot reload on `http://localhost:4021`.
- `npm test` — offline contract/unit tests (scoring determinism + provider contract).
- `npm run e2e` — real paid request through `blocky402` on Hedera testnet.

## Example flow

```bash
curl -s http://localhost:4021/catalog | jq

# Trigger 402, then pay and retry (see scripts/e2e-pay.ts for the full agent flow)
curl -i "http://localhost:4021/data/dcs-score?businessId=biz-alice-mboga"
```

## Why this matters beyond the bounty

Zacca.ai is repositioning from an MSME lending app to the credit intelligence
and agentic-finance infrastructure layer that African digital credit lenders,
SACCOs and banks build on. This provider is the first working piece of that
infrastructure: a per-call, agent-payable Credit Intelligence API, live on
Hedera rails. The bounty submission and the Q3 2026 product milestone are the
same artifact.

## Known limitations (Stage 1 demo)

- Features are synthetic (seeded by `businessId`), not yet backed by the real
  VBR Data Rail — see the production swap-point note above.
- `settle` runs after the handler returns 200, matching the reference
  architecture's v1 behaviour (testnet, zero-value acceptable for now).
- No HCS attestation of scoring decisions yet (planned — see Zacca's
  Agentic Underwriting Engine roadmap for the audit-trail layer).
