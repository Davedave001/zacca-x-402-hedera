# Zacca.ai Credit Intelligence API — decentralized, x402 on Hedera

Pay-per-query credit scoring and stablecoin lending for GenZ freelancers, gig
workers, and crypto-native earners — people who already get paid in stablecoins,
already pay for utilities and online purchases in crypto, and have a real
income history that just doesn't live inside a legacy credit bureau. Settled
on Hedera testnet, built on the x402 payment protocol.

Verified-record (VBR) lookups, payment/fintech statement evidence, DCS
scoring, and credit-limit decisioning are all decentralized onto real smart
contracts on Hedera testnet, with DCS scoring run through an ICM-structured
reasoning pipeline that writes its result on-chain, and a `CreditLine`
contract that reads that attestation and disburses real (testnet) stablecoin
against it. An agent — a lender's underwriting agent, a BNPL checkout, a
gig-platform payout app, or any autonomous buyer — pays per call in HBAR and
gets back a Dynamic Credit Score, a VBR check, or a full risk/credit-limit
assessment backed by verifiable on-chain state, not a centralized backend's
say-so.

The core insight: a freelancer or gig worker already paid in USDC has a richer,
more verifiable income signal sitting on-chain than most legacy credit files
ever capture — Zacca's `StatementRegistry` (see "Decentralized architecture"
below) is built to read exactly that evidence tier directly from a ledger, no
bank statement PDF required.

Forked from a Hedera x402 reference architecture
([matevszm/x402-hedera-example](https://github.com/matevszm/x402-hedera-example)),
which supplies the x402 + Hedera plumbing (Hono server, `blocky402` facilitator,
delegated-signing client). Everything else — the scoring engine, the ICM
pipeline, the smart contracts, the chain client — is Zacca's own.

## Catalog

| product | params | price | what it returns |
|---|---|---|---|
| `vbr-lookup` | `businessId` | 0.01 HBAR | whether the business has a Verified Business Record, read from the on-chain `VBRRegistry` |
| `dcs-score` | `businessId` | 0.02 HBAR | Dynamic Credit Score (0-100), risk tier, and a full reasoning trace, attested on-chain |
| `credit-limit` | `businessId` | 0.05 HBAR | full assessment: DCS, probability of default, recommended credit limit, max tenure — cross-checked against the on-chain `CreditLine` contract's own computation |

`GET /catalog` returns the live catalog and pricing. `businessId` is just an
opaque identifier — for this target user it's a freelancer, gig worker, or
individual earner, not necessarily a registered company; the demo data below
uses a single seeded example id (`biz-alice-mboga`, inherited from the
repo's original MSME-demo naming) rather than a fresh persona-matched one.

Two providers implement the same three endpoints, swappable via `DATA_PROVIDER`:
- **`zacca-decentralized`** (default — the production path) — smart-contract-backed, described below.
- **`zacca-credit`** (Stage 1, kept for comparison) — the original in-process, rule-based scoring engine this repo started from; see `IMPLEMENTATION_PLAN.md` §4.

## Decentralized architecture

Four smart contracts, deployed and live-exercised on Hedera testnet
(`contracts/`, own Hardhat workspace — see `contracts/README.md`):

| Contract | Purpose |
|---|---|
| `VBRRegistry` | Verified-record attestation registry (bureau file, gig-platform profile, freelance/tax registration — whatever verification exists) — claim hash only, no raw record data |
| `StatementRegistry` | Payment/fintech statement attestation — hash + aggregate cash-flow stats |
| `DCSRegistry` | On-chain attestation of the ICM pipeline's scoring output |
| `CreditLine` | Reads the DCS attestation, computes the limit, disburses stablecoin (`zUSD`, a testnet `MockStablecoin`) on `draw()` |

All three registries implement one shared `IAttestationRegistry` interface
(`attest`/`read`/`isValid`) — chain-agnostic by design: Hedera is the first
adapter, not a hard dependency, so a Celo/Polygon/Stellar adapter is a second
implementation of the same interface, not a rewrite.

### DCS scoring — ICM-structured reasoning pipeline

`src/core/icm/` replaces a single monolithic prompt with five numbered stage
folders, each carrying its own `CONTEXT.md` (what stage it is, what inputs
it's allowed, what it must output), orchestrated by `pipeline.ts`:

```
01-intake/        reads VBR + Statement attestations from the chain
02-cross-check/   flags evidence-quality issues
03-reasoning/     the LLM swap point (see below) — drafts score + rationale
04-review/        self-critique pass before anything is finalized
05-attest/        computes the credit limit, hashes the rationale, writes DCSRegistry
```

The stage outputs *are* the audit trail — a disputed score can be traced
stage-by-stage instead of re-derived from one opaque completion.

**LLM swap point:** `03-reasoning/reasoning-client.ts` defines a
`ReasoningClient` interface. The current `StubReasoningClient` is a
deterministic stand-in — no external LLM call — that reuses Zacca's existing
risk-tier/probability-of-default bands so this path stays methodologically
consistent with the Stage 1 engine. A real Claude-backed client drops in here
without touching any other stage.

### Why two Hedera keys

x402 payment uses **ED25519** Hedera accounts (native Hedera signing). The
smart contracts are deployed and called over Hedera's EVM JSON-RPC relay,
which requires a separate **ECDSA (secp256k1)** key — same as any other EVM
chain. See `contracts/README.md` for how the deployer key was generated and
funded without a second Hedera Portal signup.

## Live evidence (2026-07-21, Hedera testnet)

All three endpoints were run through the full `402 -> pay -> 200` flow against
the deployed contracts, and independently confirmed via the testnet mirror
node (not just trusted from script output):

- **`dcs-score`** for `biz-alice-mboga`: `dcs: 96`, `riskTier: "A"`, a
  four-step rationale trace, and an on-chain `DCSRegistry` attestation
  (tx `0xa0a915bd...`, `Attested` event confirmed).
- **`credit-limit`**: the ICM pipeline's off-chain-computed limit matched
  `CreditLine`'s independent on-chain computation exactly (`onChainCreditLine`
  in the response).
- **Stablecoin draw** (`scripts/demo-draw.ts`): borrower zUSD balance `0 -> 10`
  after `draw()` against the attested credit line — tx `0x7acaa96b...`,
  confirmed via mirror node. This is the actual "decentralized to enable
  stablecoin lending" payoff: score -> approve -> fund, no centralized
  loan-ops step, entirely against contract state.

Full addresses, transaction hashes, and mirror-node confirmations are in
`IMPLEMENTATION_PLAN.md` §6.

## Live oracles, a second stablecoin, VBR self-input, MetaMask (2026-07-30)

Four more features on top of the above, each live-verified with real
on-chain transactions unless noted — full detail, addresses, and exact
verification steps in `IMPLEMENTATION_PLAN.md` §12:

- **Live price oracles** — Pyth Network and Supra Oracles, both real,
  independently-confirmed Hedera testnet deployments (not simulated), feed
  a live HBAR/USD price into the ICM reasoning pipeline and the
  credit-limit computation — replacing the old "1:1 raw units" FX
  simplification with an actual conversion. Selectable via `?oracle=pyth|supra`
  or a frontend dropdown.
- **A second `CreditLine`**, backed by real Hedera testnet USDC (Circle's
  HTS token `0.0.429274`) instead of the zUSD `MockStablecoin`, selectable
  via `?stablecoin=zusd|usdc` or a frontend dropdown. **Known gap:** this
  pool is unfunded — funding it needs a token association and an actual
  Circle testnet-USDC faucet claim, both of which need a real browser
  (faucet.circle.com has no API); the zUSD `CreditLine` remains the fully
  funded, fully demoable path.
- **VBR self-input** (`POST /vbr-input` + a frontend form): submit your own
  business evidence, attested on-chain by Zacca's backend (not a
  self-attestation — see §12.3 for why), with `dcs-score`/`credit-limit`
  immediately reflecting it. Verified live: a brand-new business id went
  from "no evidence on file" to a real DCS score after submission.
- **MetaMask payment path**: MetaMask can't sign the native Hedera
  transaction the main x402 flow uses, so `src/server/evm-payment.ts`
  verifies payment via a plain HBAR value transfer + transaction receipt
  instead — a parallel path, not a literal x402 scheme extension. The
  backend half is live-verified with a real on-chain transaction (see §12.4);
  the frontend half (`src/lib/metamaskPay.ts`) is built and compiles but
  has **not been tested against a real MetaMask browser extension** — no
  headless browser was available in this session. Treat it as
  "should work, unverified in a real wallet."

## SDK for wallets and lending protocols (2026-07-30)

`sdk/` (`@zacca/sdk`, source-only, not published to npm) is the partner
integration layer from §7, actually built: `ZaccaClient` wraps the full
pay-per-query flow behind one API for both payment mechanisms
(`withHederaKey` / `withEvmWallet`), plus free helpers (`submitVbrData`)
and two direct on-chain reads that need no payment at all
(`readCreditLine`, `readLoanTerms`). See `sdk/README.md` for usage.

`readLoanTerms` reads a new contract, **`LendingAdapter`** — a small,
protocol-agnostic view interface (`getLoanTerms(businessId)`) that any
external lending protocol can call directly to price an undercollateralized
loan against a business's DCS attestation, no API key or relationship with
Zacca required. Deliberately *not* integrated with a specific protocol's
ABI: Bonzo Finance, Hedera's largest lending protocol, was exploited for
~$9M via oracle manipulation on 2026-07-11 (implicating the same Supra
price feed used elsewhere in this repo) and is currently paused — this
adapter is the stable interface for Bonzo, once restored, or any other
protocol to consume instead of a live integration with something currently
compromised. Full detail and live-verification evidence: `IMPLEMENTATION_PLAN.md` §12.5.

## Architecture

- `src/core/provider.ts` — the `DataProvider` contract (unchanged from reference)
- `src/core/dcs-scoring.ts` — Zacca's Stage 1 rule-based scoring engine
- `src/core/icm/` — the ICM-structured DCS scoring pipeline (above)
- `src/chain/` — `ethers.js` client reading/writing the deployed contracts
- `src/providers/decentralized/` — `DecentralizedCreditProvider`, the default x402-facing wrapper
- `src/providers/credit/` — `CreditScoreProvider`, the Stage 1 wrapper, kept for comparison
- `src/providers/mock/` — original reference `MockDataProvider`, kept for comparison
- `src/server/` — Hono app: pre-validation -> `paymentMiddleware` -> handler (unchanged)
- `scripts/e2e-pay.ts` — live client running the full `402 -> pay -> 200` flow against any product (`E2E_PRODUCT`)
- `scripts/seed-demo-business.ts` / `scripts/demo-draw.ts` — seed on-chain evidence and demo a stablecoin draw
- `contracts/` — separate Hardhat workspace; see `contracts/README.md`
- `frontend/` — Vite/React landing page + live demo (`pay.zacca.ai`); see `frontend/README.md`
- `sdk/` — `@zacca/sdk`, the wallet/lending-protocol integration SDK; see `sdk/README.md`

Swap data source: one line in `src/providers/index.ts` (`DATA_PROVIDER=zacca-decentralized` (default) vs `zacca-credit` vs `mock`).
Swap facilitator: change `FACILITATOR_URL`.

## Frontend & deployment

`frontend/` is a small Vite/React app: a landing page explaining the product,
a live `GET /catalog` display, an in-browser "try it live" panel that runs
the real `402 -> sign -> pay -> 200` flow against a pasted testnet key
(never leaves the browser), and a static list of verified on-chain evidence.
The backend's CORS is configured (`CORS_ORIGIN`, `src/server/app.ts`) so this
frontend can call it directly from a different domain.

Both pieces have their own Dockerfile (`Dockerfile` at repo root for the
backend, `frontend/Dockerfile` for the frontend) and are meant to deploy as
two separate Coolify resources -- `pay-api.zacca.ai` and `pay.zacca.ai`.
Full step-by-step deploy instructions, required env vars, and gotchas
(CORS origin matching, `VITE_API_BASE_URL` being a build-time arg, the
backend needing `contracts/deployments/hederaTestnet.json` at runtime) are
in `DEPLOY.md`. Local smoke test: `docker compose up --build`, then
`http://localhost:8080` (frontend) and `http://localhost:4021/catalog`
(backend).

## Setup

Requires Node.js >=20.

### API server (root)

1. `npm install`
2. Copy `.env.example` to `.env`:
   - `PAY_TO_ACCOUNT` (receiver, account id only), `HEDERA_CLIENT_ID` / `HEDERA_CLIENT_KEY` (funded ED25519 testnet payer account). **`PAY_TO_ACCOUNT` must be a different account than `HEDERA_CLIENT_ID`** — a Hedera `TransferTransaction` nets same-account transfers to zero, so paying yourself settles as a 0-amount transfer and the facilitator rejects it as an amount mismatch.
   - `HEDERA_TESTNET_DEPLOYER_KEY` (ECDSA — see `contracts/README.md`) and `HEDERA_JSON_RPC_URL`, needed by `zacca-decentralized` to read/write the contracts.
3. `npm run dev` — start with hot reload on `http://localhost:4021`.
4. `npm test` — offline unit tests (scoring determinism, provider contract, ICM pipeline stages).
5. `npm run e2e` — real paid request through `blocky402` on Hedera testnet (`E2E_PRODUCT=vbr-lookup|dcs-score|credit-limit`).

### Contracts (`contracts/`)

See `contracts/README.md` for the full walkthrough. Short version:

```bash
cd contracts
npm install
npm test                # 14 unit tests
npm run deploy:testnet  # writes deployments/hederaTestnet.json
```

### Seeding demo data

```bash
npx tsx scripts/seed-demo-business.ts   # attests VBR + Statement for biz-alice-mboga, links a CreditLine wallet
npx tsx scripts/demo-draw.ts            # draws zUSD against the attested credit line
```

## Example flow

```bash
curl -s http://localhost:4021/catalog | jq

# Trigger 402, then pay and retry (see scripts/e2e-pay.ts for the full agent flow)
curl -i "http://localhost:4021/data/dcs-score?businessId=biz-alice-mboga"
```

## Why this matters

Zacca.ai is repositioning from a legacy-style lending app to the credit
intelligence and agentic-finance infrastructure layer that stablecoin-native
fintechs, BNPL providers, and gig/freelance platforms build on top of — for
users legacy credit bureaus were never built to see. GenZ freelancers, gig
workers, and crypto-native earners increasingly get paid, pay bills, and shop
entirely in stablecoins (via platforms like HoneyCoin, Kotani Pay, Due Wallet,
and similar cross-border stablecoin rails) with zero traditional credit file
to show for it, despite having an income history that's more complete and more
verifiable than a bank statement, because it's already sitting on a public
ledger. This isn't just a per-call scoring API — it's decentralized credit
infrastructure an autonomous lender, a BNPL checkout, or a gig-payout app can
extend stablecoin credit against directly, reading that on-chain income
signal without trusting Zacca's backend for the decision.

## Known limitations, disclosed transparently

- **Stage 2, not Stage 3** (see `IMPLEMENTATION_PLAN.md` §6.5): one key is the
  sole attestor on all registries — not yet a multi-bureau attestor quorum.
  `setAttestor()` exists on every registry so a quorum can be added without a
  redeploy.
- **Stubbed LLM reasoning** — `StubReasoningClient` is deterministic, not a
  real model call; see the ICM swap point above.
- **No cross-chain attestation bridge yet** — only Hedera-native attestations
  are reachable today.
- **`settle` runs after the handler returns 200**, matching the reference
  architecture's behavior (acceptable for testnet).
- **Credit-limit FX conversion now uses a real oracle price** (Pyth or Supra,
  see above) instead of the old 1:1 raw-unit simplification — but falls back
  to a conservative static price if both oracles are unreachable.
- **The USDC-backed `CreditLine` pool is unfunded** — needs a token
  association and a real testnet-USDC faucet claim, both browser-only steps.
  See the section above.
- **The MetaMask frontend flow hasn't been tested in a real browser/wallet
  extension** — the backend verification it depends on has been, with a
  real on-chain transaction. See the section above.
- **Payment settlement is HBAR-on-Hedera only** for the main x402 flow —
  multi-chain facilitator support for partner fintechs paying in their own
  stablecoin isn't built (the MetaMask path is a same-chain, alternate
  *signing method*, not multi-chain payment support).
- **No partner-facing SDKs, API docs, or x402-gated disbursement endpoint
  yet** — see `IMPLEMENTATION_PLAN.md` §7.
