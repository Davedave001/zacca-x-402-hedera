# Zacca Credit Intelligence API on x402/Hedera — Implementation Plan

**Context:** Hedera bounty — "Build the internet's payment layer." Runs 2026-07-13 to 2026-07-31, 11:59 PM ET. Five prizes of $1,000. Submission requires a public open-source repo, on-chain testnet transactions with HashScan links, a <5 min demo video, and the submission form.

**Relation to the Zacca ecosystem:** this is not a standalone hackathon demo. It is the first working piece of two products already scoped in [`zacca-system-architecture/docs/AGENTIC_CREDIT_INFRASTRUCTURE_IMPLEMENTATION_PLAN.md`](../zacca-system-architecture/docs/AGENTIC_CREDIT_INFRASTRUCTURE_IMPLEMENTATION_PLAN.md):
- **Product 2 — Credit Intelligence API** (the DCS/BHS scoring engine), and
- **Product 4 — Agent Payments Facilitator** (x402-gated, Hedera-settled endpoints).

The Stage 1 rule-based DCS methodology implemented here comes from the same concept-paper logic documented in `Zacca Data Modelling/ZACCA_TECHNICAL_ARCHITECTURE.md` §4 (Credit Intelligence Engine). This repo forks the bounty's reference architecture 1 (agent-pays-per-query) rather than architecture 2 (file marketplace), because per-query scoring is literally Zacca's own product shape.

**This is the actual submission, not a stripped-down demo of it.** All four moving parts — bureau (VBR) lookups, payment/fintech statement evidence, DCS scoring, and credit-limit decisioning — are decentralized onto real smart contracts, deployed and exercised live on Hedera testnet: a `VBRRegistry`, `StatementRegistry`, and `DCSRegistry` hold on-chain attestations, DCS scoring runs through an ICM-structured reasoning pipeline that writes its result on-chain, and a `CreditLine` contract reads that attestation and disburses real (testnet) stablecoin against it — an autonomous lender extending credit directly against verifiable on-chain state, not a centralized backend's say-so. See §6 for the architecture and real transaction evidence.

---

## 1. What this repo is

A Hono-based x402 resource server, forked from [`matevszm/x402-hedera-example`](https://github.com/matevszm/x402-hedera-example), serving three pay-per-query credit-intelligence products. An agent (a lender's underwriting agent, a borrower-facing app, or any autonomous buyer) hits a `402`, pays in HBAR on Hedera testnet via the `blocky402` facilitator, and gets back a credit-scoring result — no accounts, invoices, or subscriptions, the "one-line swap the provider" pattern the reference demonstrates.

Two providers implement the same three endpoints, swappable via `DATA_PROVIDER`:
- **`zacca-decentralized`** (default, the actual submission) — `src/providers/decentralized/`. Backed by real smart contracts on Hedera testnet (`contracts/`) and an ICM-structured LLM-reasoning pipeline (`src/core/icm/`). See §6.
- **`zacca-credit`** (Stage 1, kept for comparison) — `src/providers/credit/`. The original in-process, rule-based scoring engine this repo started from. See §4.

Two on-chain identities are involved, for a Hedera-specific reason worth knowing going in: the x402 payment flow uses **ED25519** Hedera accounts (native Hedera signing), while the smart contracts are deployed and called over Hedera's EVM JSON-RPC relay, which requires a separate **ECDSA** key (see `contracts/README.md`).

## 2. Current state

| Item | Status |
|---|---|
| Scaffold config (`package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`) | Present in this folder |
| README describing architecture, catalog, scoring logic | Present — see [`README.md`](README.md) |
| `src/core/dcs-scoring.ts` (Stage 1 rule-based scoring engine) | **Present, verified** — Step 0 confirmed on 2026-07-21 |
| `src/providers/credit/credit-provider.ts` (`CreditScoreProvider`) | **Present, verified** |
| `src/providers/mock/` (original reference provider, kept for comparison) | Present |
| `src/server/` (Hono app wiring) | Present |
| `scripts/e2e-pay.ts` (live 402→pay→200 client) | **Run live against all 3 products 2026-07-21** — see §6 for results |
| `npm run typecheck` / `npm test` | **Clean typecheck; 47/47 tests passing** (verified 2026-07-21 — exceeds the 30/30 prior-session baseline) |
| `.env` (from `.env.example`) | **Created 2026-07-21** — client account `0.0.6188111`, `PAY_TO_ACCOUNT` `0.0.9564717` (must be a distinct account — see Step 2 note) |
| Funded Hedera testnet account | **Done** — two accounts (payer + receiver), both funded via Hedera Portal |
| `@x402/core` / `@x402/fetch` / `@x402/hedera` / `@x402/hono` | Upgraded `2.16.0` → `2.19.0` (latest, 2026-07-21) while debugging Step 2; typecheck/tests stayed green |
| Public GitHub repo | **Live** — [`Davedave001/zacca-x-402-hedera`](https://github.com/Davedave001/zacca-x-402-hedera) |
| HashScan transaction links (payment) | **Captured 2026-07-21** — `0.0.7162784-1784634002-574637628` ([HashScan](https://hashscan.io/testnet/transaction/0.0.7162784-1784634002-574637628), confirmed via mirror node: `result: SUCCESS`) |
| `contracts/` (Hardhat workspace: `VBRRegistry`, `StatementRegistry`, `DCSRegistry`, `MockStablecoin`, `CreditLine`) | **Built, tested (14/14), deployed to Hedera testnet 2026-07-21** — see §6 for addresses |
| `src/core/icm/` (ICM-structured DCS scoring pipeline, §6.3) | **Built, tested (11/11)** — stubbed reasoning client (deterministic, no external LLM call; real-LLM swap point documented) |
| `src/chain/` (ethers.js client reading/writing the deployed contracts) | **Built** |
| `src/providers/decentralized/` (`DecentralizedCreditProvider`, now the default `DATA_PROVIDER`) | **Built, live-verified against all 3 endpoints 2026-07-21** |
| Demo business seeded on-chain (`biz-alice-mboga`: VBR + Statement attestations, linked CreditLine wallet) | **Done 2026-07-21** — `scripts/seed-demo-business.ts` |
| Live stablecoin draw against `CreditLine` (§6.4 payoff) | **Done, verified on mirror node 2026-07-21** — `scripts/demo-draw.ts`, 10 zUSD disbursed |
| Demo video (<5 min) | **Not yet recorded** |
| Submission form | **Not yet submitted** |

Net: Step 0–3 of the original bounty-scoped checklist (§8) are done, and the scope itself expanded partway through: rather than shipping Stage 1 alone and treating decentralization as a post-bounty roadmap, §6 was built and deployed for this submission. The blocking path now is Step 4–5 (demo video, submit).

## 3. Product catalog (as designed)

| product | params | price | returns |
|---|---|---|---|
| `vbr-lookup` | `businessId` | 0.01 HBAR | whether the business has a Verified Business Record |
| `dcs-score` | `businessId` | 0.02 HBAR | Dynamic Credit Score (0–100) and risk tier |
| `credit-limit` | `businessId` | 0.05 HBAR | full assessment: DCS, probability of default, recommended credit limit, max tenure |

`GET /catalog` returns the live catalog and pricing.

Endpoint shapes are stable across §6: `vbr-lookup`, `dcs-score`, and `credit-limit` are the same three x402-priced calls whether served by the Stage 1 (`zacca-credit`) or decentralized (`zacca-decentralized`, default) provider — what backs each one moves from in-process compute to a contract read/write (registry attestation, ICM-pipeline attestation, `CreditLine` decision, respectively).

## 4. Scoring logic — Stage 1 (cold-start, rule-based)

Matches the concept-paper methodology: cash-flow, stability, customer-behaviour and operational features combine into a 0–100 DCS score, a risk tier, and `Credit Limit = Monthly Turnover × Risk Multiplier`. No historical default data required — this is the rule-based fallback used before enough loan-outcome data exists for Stage 2 (logistic regression).

For this demo, features are deterministically derived from `businessId` via a seeded PRNG (same technique as the reference `MockDataProvider`), so the provider is self-contained and reproducible without a live data pipeline.

**Production swap point:** replace `syntheticFeaturesFor()` with a real lookup against the Zacca VBR Data Rail (Chat-to-Credit pipeline output, Product 1 in the parent implementation plan). Nothing else — provider, catalog, server wiring — needs to change. This is also the entry point for the fuller decentralization described in §6: the "real lookup" ultimately becomes a contract read against attested on-chain evidence rather than a call into a centralized data pipeline.

## 5. Architecture

- `src/core/provider.ts` — the `DataProvider` contract (unchanged from reference)
- `src/core/dcs-scoring.ts` — Zacca's Stage 1 rule-based scoring engine (§4)
- `src/core/icm/` — the ICM-structured DCS scoring pipeline (§6.3): `01-intake/` → `02-cross-check/` → `03-reasoning/` → `04-review/` → `05-attest/`, each with its own `CONTEXT.md`, orchestrated by `pipeline.ts`
- `src/chain/` — `ethers.js` client (`client.ts`) reading/writing the deployed contracts, plus `abis.ts` and `deployment.ts` (loads `contracts/deployments/hederaTestnet.json`)
- `src/providers/decentralized/decentralized-credit-provider.ts` — `DecentralizedCreditProvider`, the default x402-facing wrapper, backed by `src/chain/` + `src/core/icm/`
- `src/providers/credit/credit-provider.ts` — `CreditScoreProvider`, the Stage 1 wrapper, kept for comparison
- `src/providers/mock/` — original reference `MockDataProvider`, kept for comparison
- `src/server/` — Hono app: pre-validation → `paymentMiddleware` → handler (unchanged)
- `scripts/e2e-pay.ts` — live client running the full `402 → pay → 200` flow against any product (`E2E_PRODUCT`)
- `scripts/seed-demo-business.ts` — attests VBR + Statement evidence and links a `CreditLine` wallet for the demo business
- `scripts/demo-draw.ts` — draws real (testnet) stablecoin against the demo business's credit line
- `contracts/` — separate Hardhat workspace (own `package.json`); see §6 and `contracts/README.md`

Swap data source: one line in `src/providers/index.ts` (`DATA_PROVIDER=zacca-decentralized` (default) vs `zacca-credit` vs `mock`). Swap facilitator: change `FACILITATOR_URL`.

## 6. Decentralized architecture for stablecoin lending — built and deployed

This is Stage 2 of the roadmap (see §6.5): Zacca's own backend acting as the sole attestor, not yet a multi-bureau attestor quorum (Stage 3). All four pieces below are real, deployed, and were exercised live against Hedera testnet on 2026-07-21 — not a design sketch. Contracts live in `contracts/` (own Hardhat workspace, own `README.md`); addresses are in `contracts/deployments/hederaTestnet.json`.

**Chain-agnostic by design.** Everything below is deployed on Hedera because that's this repo's bounty-driven reference implementation — but none of it is architected as Hedera-only. Cross-border stablecoin fintechs (HoneyCoin, Kotani Pay, Due Wallet, MyEtherWallet-style wallets, and similar) already settle on whatever chain fits their corridor — Celo, Polygon, Stellar-based rails, Tron, Ethereum L2s, Hedera itself — and Zacca's credit-intelligence layer needs to sit underneath all of them rather than force a chain migration onto a partner. Concretely, `VBRRegistry`, `StatementRegistry`, and `DCSRegistry` all implement one shared `IAttestationRegistry` interface (`attest`/`read`/`isValid`, `contracts/contracts/interfaces/IAttestationRegistry.sol`) — Hedera Smart Contract Service is the first adapter implementing it; a Celo, Polygon, or Stellar adapter is a second implementation of the same interface, not a rewrite. The ICM scoring pipeline (§6.3) never talks to a chain directly — it consumes and produces attestations via an injected `ChainReader`/`ChainWriter` — so it's chain-agnostic by construction. See §7 for how this becomes something partners actually integrate against (not yet built).

### 6.1 VBR lookup — decentralized bureau attestation registry

**`VBRRegistry`** — `0x9e5B1EEf866112d4641C3034DdF8e8F4Fdb3aa04` on Hedera testnet. Holds no raw bureau data, only attestations:
- An **attestor** (Zacca's own backend today, per the Stage 2 note above) signs a claim hash and submits it via `attest(businessId, claimHash, expiresAt, extra)`.
- `vbr-lookup` is a contract read (`isValid`/`read`) — verifiable by any third party, not just Zacca's backend. Live-verified 2026-07-21: paid `vbr-lookup` call for `biz-alice-mboga` returned `vbrVerified: true` plus the on-chain attestation (claim hash, issuer, expiry) read directly from the contract.
- Cross-chain bureaus (data pipelines on a different chain entirely) are future work — a cross-chain attestation bridge, not yet built; see §6.5.
- Seed attestation transaction: `0xd81b6a0de8446c5191fa60fd6098848072790b7af55acf41c1549f458fb6f880` (`scripts/seed-demo-business.ts`).

### 6.2 Payment / fintech transaction statements — decentralized statement attestation

**`StatementRegistry`** — `0xd8cB93ec53098fc2e16796c47f5A262e2049f02A`. Same `attest`/`read` interface as §6.1; `extra` carries `abi.encode(periodStart, periodEnd, monthlyTurnoverTinybars)` — aggregate cash-flow stats, never the raw statement.
- Seed attestation transaction: `0x919584fe88ea64e9cd8cef30dae28d5c08f02d47355f1dc58cba9867d82a7b93` — `biz-alice-mboga` attested at 8,000,000,000 tinybars (~80 HBAR) monthly turnover.
- Reading transaction history natively off a chain (no attestor needed, strongest evidence tier) is future work — see §6.5.

### 6.3 DCS scoring — LLM-driven deep reasoning, structured as an ICM workspace

`src/core/icm/` implements the pipeline as five numbered stage folders, each with its own `CONTEXT.md` and orchestrated by `pipeline.ts` — see §5. Each stage only sees the inputs its `CONTEXT.md` grants it, and the stage outputs *are* the audit trail: a disputed score can be traced stage-by-stage rather than re-derived from one opaque completion.

- `01-intake/` reads `VBRRegistry`/`StatementRegistry` via `src/chain/client.ts` and decodes the statement's aggregate stats.
- `02-cross-check/` flags evidence-quality issues (missing corroboration, implausible turnover, malformed periods).
- `03-reasoning/` is the **LLM swap point**: `reasoning-client.ts` defines the `ReasoningClient` interface; the current `StubReasoningClient` is a deterministic stand-in (no external LLM call), reusing Zacca's existing risk-tier/PD bands (`dcs-scoring.ts`) so Stage 1 and this Stage 2 path stay methodologically consistent. A real Claude-backed client drops in here without touching any other stage.
- `04-review/` self-checks the draft (score in range, tier matches the score band, PD in range) before anything is finalized.
- `05-attest/` computes the credit limit/tenure, hashes the full rationale (`keccak256`), and writes to **`DCSRegistry`** — `0x0Fa9b992f554b04Dedf0d136Ea0dAAE8bdb92A83`.

Live-verified 2026-07-21: a paid `dcs-score` call for `biz-alice-mboga` ran the full pipeline and returned `dcs: 96`, `riskTier: "A"`, a four-step rationale trace, `rationaleHash`, and the on-chain attestation transaction `0xa0a915bd0ac9324a08e4e5776bfab51b667ba26c3289666922dbaa238482e537` — independently confirmed via the testnet mirror node (`error_message: null`, `Attested` event with the matching business id and rationale hash).

### 6.4 Credit limit — autonomous on-chain decisioning enabling stablecoin lending

**`CreditLine`** — `0x08A86476f0224a1c847060E23b372083687B5800`. Reads the current `DCSRegistry` attestation directly (no API call back into a centralized scoring service), decodes `(dcs, pdBps, riskTier, creditLimitTinybars, maxTenureMonths)`, and lets the linked wallet `draw()` real stablecoin against the limit.

**`MockStablecoin`** (zUSD, 6 decimals) — `0x1a25e6A46799865745a11D1250046eca04100747`. Testnet stand-in for a real stablecoin (USDC via Hedera HTS, or a partner's own — §7); the `CreditLine` contract holds a 1,000,000 zUSD lending pool, minted at deploy time.

Live-verified 2026-07-21 (`scripts/demo-draw.ts`):
- `availableCredit("biz-alice-mboga")` read `24,000 zUSD` directly from the contract — independently matching the ICM pipeline's off-chain-computed `recommendedCreditLimitTinybars` returned by the paid `credit-limit` endpoint, proving the contract's on-chain computation and the pipeline's off-chain computation agree.
- Borrower zUSD balance before: `0`. Called `draw("biz-alice-mboga", 10 zUSD)`.
- Transaction `0x7acaa96bafb860e5e208a0bd5fb5a6677b50cd3a416106287b71c4cc254dcc38` — confirmed via mirror node (`error_message: null`).
- Borrower zUSD balance after: `10`. Remaining available credit: `23,990 zUSD`.

This is the actual payoff of the whole chain: "get scored" (§6.3) → "get approved" (§6.4 reads the attestation) → "get funded" (§6.4 disburses) with no centralized loan-ops step in between, and a lender — a human-run pool, another autonomous agent, or an integrating fintech partner (§7) — could extend this credit purely against contract state.

**Known simplification, disclosed transparently:** `creditLimitTinybars` (denominated per the HBAR-tinybars naming inherited from the x402 catalog) is applied 1:1 as raw zUSD token units rather than converted through an actual HBAR-to-USD exchange rate — so "24,000,000,000" becomes "24,000 zUSD," not a currency-converted figure. Fine for proving the mechanism works; a real deployment needs an actual price feed between the evidence currency and the disbursed stablecoin.

### 6.5 What's still Stage 2, not Stage 3

- **Single attestor, not a quorum.** One EVM key (`HEDERA_TESTNET_DEPLOYER_KEY`) is `owner`/attestor on all three registries and `registrar` on `CreditLine` — this is Zacca's own backend acting as attestor, not the multi-bureau attestor quorum described as the Stage 3 target. `setAttestor()` exists on every registry so a quorum can be added without a redeploy.
- **No cross-chain attestation bridge yet.** Evidence from bureaus/data pipelines on other chains isn't reachable yet — only Hedera-native attestations.
- **Stubbed LLM reasoning.** `StubReasoningClient` is deterministic, not a real model call — see §6.3's swap point.
- **ECDSA key management is manual.** The deployer/attestor key was generated ad hoc and funded via Hedera's EVM-auto-account-creation (see `contracts/README.md`) — a production deployment needs real key custody (HSM/KMS), not a key sitting in `.env`.
- **No governance on the limit formula.** `CreditLine`'s limit/tenure decoding is fixed contract logic, not yet upgradable/governable.

## 7. Partner integration layer — SDKs & API docs for stablecoin fintechs

The x402-gated REST API (§1, §3) is the source of truth, but asking a partner fintech to hand-roll "detect 402 → pay → retry" against raw HTTP is the wrong integration surface for a production BNPL or lending flow. This section is what turns "Zacca has an API" into "cross-border stablecoin fintechs — HoneyCoin, Kotani Pay, Due Wallet, MyEtherWallet-style wallets, and similar — build stablecoin-lending and BNPL products on top of Zacca." It's downstream of §6 and depends on the chain-agnostic design principle stated there: a partner should be able to pay for and settle against Zacca in whatever stablecoin/chain they already hold, not be forced onto HBAR/Hedera.

### 7.1 What partners integrate against
- The three existing endpoints — `vbr-lookup`, `dcs-score`, `credit-limit` (§3) — stay the integration surface for credit intelligence; endpoint shapes didn't change as the backing decentralized (§3's note, now proven true in practice — see §6).
- `CreditLine` (§6.4) is deployed and its `draw()` payoff is demonstrated (`scripts/demo-draw.ts`), but only as a direct contract call, not yet as an x402-gated API surface. A fourth endpoint — credit disbursement/repayment against `CreditLine` — for partners who want Zacca to originate/fund the line via the API directly, not just score it, is still not built.

### 7.2 SDKs
- **TypeScript/JavaScript SDK** — first priority; matches the stack most wallet/fintech front ends and Node backends in this space already run on. Wraps the x402 challenge/pay/retry cycle, types the request/response for all three (soon four) endpoints, and — once multi-chain settlement lands — handles facilitator/chain selection so a partner pays in whatever stablecoin/chain they already hold.
- **Python SDK** — same wrapping, for partners with Python backend/risk stacks.
- Both SDKs are thin: no business logic duplicated client-side, just typed request/response plus payment-flow handling, so the scoring/decisioning logic in §4/§6 stays server-side and auditable in one place, not forked across every partner's client code.

### 7.3 API docs
- OpenAPI/Swagger spec generated from the Hono route definitions — single source of truth, so docs can't drift from what `/catalog` actually returns.
- Published docs site: a quickstart per endpoint (`vbr-lookup`, `dcs-score`, `credit-limit`, and the future disbursement endpoint), authentication/payment setup, a clear sandbox vs. testnet vs. mainnet distinction, and — once §6 lands — one page per chain adapter documenting which stablecoins/chains are supported for settlement.
- Two reference integration flows, since these are the shapes partners actually need: a minimal "BNPL checkout" (score-then-approve-at-checkout) and a minimal "credit-line onboarding" (score-then-open-a-standing-line).

### 7.4 Partner onboarding concerns beyond raw API access
- Per-partner API keys and rate limits in addition to per-call x402 payment — a BNPL partner scoring thousands of checkouts a day needs predictable throughput, not just "pay per call."
- Sandbox/testnet mode backed by the existing Stage 1 synthetic data (`syntheticFeaturesFor()`, §4), so partners can integrate and test before their own VBR/statement attestations exist.

## 8. Remaining work — sequenced checklist (full submission scope)

**Step 0 — reconcile code into this checkout** ✅ done 2026-07-21
- `src/` (core, providers, server) and `scripts/e2e-pay.ts` were already present and complete in this checkout — the earlier "needs restoring" note in §2 was stale.
- `npm run typecheck` clean; `npm test` — 47/47 passing (exceeds the prior 30/30-passing baseline).

**Step 1 — Hedera testnet setup** ✅ done 2026-07-21
- Created/funded two Hedera testnet accounts via the Hedera Portal: `0.0.6188111` (client/payer) and `0.0.9564717` (`PAY_TO_ACCOUNT`).
- `.env` created from `.env.example` with both.

**Step 2 — run the live flow** ✅ done 2026-07-21
- `npm run dev` + `npm run e2e` against `dcs-score` — full `402 → pay → 200` round trip confirmed.
- Settlement transaction: `0.0.7162784-1784634002-574637628` — [HashScan](https://hashscan.io/testnet/transaction/0.0.7162784-1784634002-574637628), independently confirmed via the testnet mirror node (`result: SUCCESS`, transfers: `0.0.6188111 -2,000,000` / `0.0.9564717 +2,000,000` tinybars, plus the facilitator's network-fee transfer).
- **Gotcha hit along the way, worth keeping in mind for the demo script:** the first attempt used the *same* account for both the client payer and `PAY_TO_ACCOUNT` (only one funded account existed at the time). A Hedera `TransferTransaction` nets same-account transfers to zero, so the facilitator correctly rejected it as `invalid_exact_hedera_payload_amount_mismatch` — payer and payee must be distinct accounts. Also upgraded `@x402/*` from `2.16.0` to `2.19.0` while investigating (good hygiene regardless, but was not the actual fix).

**Step 3 — publish** ✅ initial push done 2026-07-21, needs a follow-up push
- Public repo live: [`Davedave001/zacca-x-402-hedera`](https://github.com/Davedave001/zacca-x-402-hedera) (pushed before §6 was built — a follow-up commit/push covering `contracts/`, `src/core/icm/`, `src/chain/`, `src/providers/decentralized/`, and this doc is still needed).
- Keep README's "why this matters beyond the bounty" framing — Zacca repositioning as credit-intelligence infrastructure, not just an MSME lending app.

**Step 4 — demo video (<5 min)**
- Show `GET /catalog`.
- Trigger a `402` on `dcs-score`, show it settling via the client script, show the ICM pipeline's rationale trace in the response.
- Show the on-chain evidence: the `DCSRegistry` attestation transaction, and `credit-limit`'s `onChainCreditLine` matching the off-chain-computed limit.
- Show `scripts/demo-draw.ts` disbursing real zUSD against the credit line — the actual "stablecoin lending" payoff, not just a data check.
- Show at least one HashScan/mirror-node link as independent proof.
- Narrate as "Zacca's Credit Intelligence API, agent-payable on Hedera, backed end-to-end by on-chain attestations and autonomous stablecoin lending" — tie back to the underwriting-engine use case (a lender's agent paying per score instead of a flat data subscription), matching the bounty's own reference-architecture framing.

**Step 5 — submit**
- Submission form, repo link, demo video, HashScan links — before 2026-07-31 11:59 PM ET.

## 9. Known limitations, disclosed transparently in submission

Decentralized-architecture limitations (§6) are listed in §6.5 — Stage 2, not Stage 3. Remaining ones:

- `settle` runs after the handler returns 200, matching the reference architecture's current behavior (acceptable for testnet).
- Payment settlement is HBAR-on-Hedera only (`blocky402`, `PAY_TO_ACCOUNT`); multi-chain facilitator support (§7) needed for cross-border stablecoin fintech partners to pay in their own stablecoin isn't built yet — only the on-chain *evidence/scoring/lending* side is chain-agnostic-by-design so far (§6 intro), not yet the payment side.
- No partner-facing SDKs, API docs site, OpenAPI spec, or an x402-gated disbursement endpoint yet — see §7.
- The Stage 1 provider (`zacca-credit`, `src/providers/credit/`) still uses synthetic, seeded-PRNG features (`syntheticFeaturesFor()`, §4) — kept for comparison, not the default; the default (`zacca-decentralized`) uses real on-chain attestations instead (§6.1/6.2), though those attestations were themselves seeded by Zacca's own backend rather than a real bureau/statement pipeline (§6.5).
- `CreditLine`'s credit-limit units are a known simplification, not exact FX conversion — see the callout at the end of §6.4.

## 10. Open dependency carried over from the parent plan

Per the ecosystem-level implementation plan's §11: any code patterns reused from prior collaborations must be cleanly separated/re-implemented before shipping under the Zacca name. This repo forks a third-party bounty reference (`matevszm/x402-hedera-example`) for the x402/Hedera plumbing only; `CreditScoreProvider`/`dcs-scoring.ts` (Stage 1), and everything in §6 (`contracts/`, `src/core/icm/`, `src/chain/`, `src/providers/decentralized/`) are original Zacca logic and are the actual submission asset.

**License check (2026-07-21):** verified via the GitHub API — `matevszm/x402-hedera-example` has **no LICENSE file** (`license: null`), so the earlier "MIT-style" assumption in this doc was wrong; default copyright applies. Decision: proceed without adding a LICENSE file or attribution note, on the basis that the repo was published as a bounty reference architecture explicitly meant to be forked by contestants. Revisit if this submission is ever repurposed commercially beyond the bounty. (`contracts/` has its own `package.json`, MIT-licensed, using `@openzeppelin/contracts` — also MIT — for `ERC20`/`Ownable`; no license ambiguity there.)
