# Zacca Credit Intelligence API on x402/Hedera — Implementation Plan

**Context:** Hedera bounty — "Build the internet's payment layer." Runs 2026-07-13 to 2026-07-31, 11:59 PM ET. Five prizes of $1,000. Submission requires a public open-source repo, on-chain testnet transactions with HashScan links, a <5 min demo video, and the submission form.

**Relation to the Zacca ecosystem:** this is not a standalone hackathon demo. It is the first working piece of two products already scoped in [`zacca-system-architecture/docs/AGENTIC_CREDIT_INFRASTRUCTURE_IMPLEMENTATION_PLAN.md`](../zacca-system-architecture/docs/AGENTIC_CREDIT_INFRASTRUCTURE_IMPLEMENTATION_PLAN.md):
- **Product 2 — Credit Intelligence API** (the DCS/BHS scoring engine), and
- **Product 4 — Agent Payments Facilitator** (x402-gated, Hedera-settled endpoints).

The Stage 1 rule-based DCS methodology implemented here comes from the same concept-paper logic documented in `Zacca Data Modelling/ZACCA_TECHNICAL_ARCHITECTURE.md` §4 (Credit Intelligence Engine). This repo forks the bounty's reference architecture 1 (agent-pays-per-query) rather than architecture 2 (file marketplace), because per-query scoring is literally Zacca's own product shape.

**Beyond the bounty:** the intended end state decentralizes all four moving parts — bureau (VBR) lookups, payment/fintech statement evidence, DCS scoring, and credit-limit decisioning — onto smart contracts, so an autonomous lender can extend stablecoin credit directly against verifiable on-chain state instead of trusting a centralized backend. See §6 for the target architecture; this is a post-bounty roadmap, not part of the 2026-07-31 submission.

---

## 1. What this repo is

A Hono-based x402 resource server, forked from [`matevszm/x402-hedera-example`](https://github.com/matevszm/x402-hedera-example), with the reference `MockDataProvider` swapped for a real `CreditScoreProvider` implementing Zacca's Stage 1 DCS logic. An agent (a lender's underwriting agent, a borrower-facing app, or any autonomous buyer) hits a `402`, pays in HBAR on Hedera testnet via the `blocky402` facilitator, and gets back a credit-scoring result. No accounts, invoices, or subscriptions — the exact "one-line swap the provider" pattern the reference demonstrates.

## 2. Current state

| Item | Status |
|---|---|
| Scaffold config (`package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`) | Present in this folder |
| README describing architecture, catalog, scoring logic | Present — see [`README.md`](README.md) |
| `src/core/dcs-scoring.ts` (Stage 1 rule-based scoring engine) | **Present, verified** — Step 0 confirmed on 2026-07-21 |
| `src/providers/credit/credit-provider.ts` (`CreditScoreProvider`) | **Present, verified** |
| `src/providers/mock/` (original reference provider, kept for comparison) | Present |
| `src/server/` (Hono app wiring) | Present |
| `scripts/e2e-pay.ts` (live 402→pay→200 client) | Present, not yet run against a real facilitator (needs Step 1) |
| `npm run typecheck` / `npm test` | **Clean typecheck; 47/47 tests passing** (verified 2026-07-21 — exceeds the 30/30 prior-session baseline) |
| `.env` (from `.env.example`) | **Created 2026-07-21** — client account `0.0.6188111`, `PAY_TO_ACCOUNT` `0.0.9564717` (must be a distinct account — see Step 2 note) |
| Funded Hedera testnet account | **Done** — two accounts (payer + receiver), both funded via Hedera Portal |
| `@x402/core` / `@x402/fetch` / `@x402/hedera` / `@x402/hono` | Upgraded `2.16.0` → `2.19.0` (latest, 2026-07-21) while debugging Step 2; typecheck/tests stayed green |
| Public GitHub repo | **Not yet created** — bounty requires this |
| HashScan transaction links | **Captured 2026-07-21** — `0.0.7162784-1784634002-574637628` ([HashScan](https://hashscan.io/testnet/transaction/0.0.7162784-1784634002-574637628), confirmed via mirror node: `result: SUCCESS`) |
| Demo video (<5 min) | **Not yet recorded** |
| Submission form | **Not yet submitted** |

Net: Step 0 (reconcile code into this checkout) is done — the scaffold in this folder was already complete and passing, the earlier "needs restoring" note above was stale. Step 1 and Step 2 are also done as of 2026-07-21 (see the note under Step 2 below for a real gotcha hit along the way). The blocking path now is Step 3–5 (publish, demo, submit).

## 3. Product catalog (as designed)

| product | params | price | returns |
|---|---|---|---|
| `vbr-lookup` | `businessId` | 0.01 HBAR | whether the business has a Verified Business Record |
| `dcs-score` | `businessId` | 0.02 HBAR | Dynamic Credit Score (0–100) and risk tier |
| `credit-limit` | `businessId` | 0.05 HBAR | full assessment: DCS, probability of default, recommended credit limit, max tenure |

`GET /catalog` returns the live catalog and pricing.

Endpoint shapes are stable across the roadmap in §6: `vbr-lookup`, `dcs-score`, and `credit-limit` stay the same three x402-priced calls, but what backs each one moves from in-process compute to a contract read/write (registry attestation, LLM-reasoning attestation, `CreditLine` decision, respectively) as each piece decentralizes.

## 4. Scoring logic — Stage 1 (cold-start, rule-based)

Matches the concept-paper methodology: cash-flow, stability, customer-behaviour and operational features combine into a 0–100 DCS score, a risk tier, and `Credit Limit = Monthly Turnover × Risk Multiplier`. No historical default data required — this is the rule-based fallback used before enough loan-outcome data exists for Stage 2 (logistic regression).

For this demo, features are deterministically derived from `businessId` via a seeded PRNG (same technique as the reference `MockDataProvider`), so the provider is self-contained and reproducible without a live data pipeline.

**Production swap point:** replace `syntheticFeaturesFor()` with a real lookup against the Zacca VBR Data Rail (Chat-to-Credit pipeline output, Product 1 in the parent implementation plan). Nothing else — provider, catalog, server wiring — needs to change. This is also the entry point for the fuller decentralization described in §6: the "real lookup" ultimately becomes a contract read against attested on-chain evidence rather than a call into a centralized data pipeline.

## 5. Architecture

- `src/core/provider.ts` — the `DataProvider` contract (unchanged from reference)
- `src/core/dcs-scoring.ts` — Zacca's scoring engine (the real deliverable)
- `src/providers/credit/credit-provider.ts` — `CreditScoreProvider`, the x402-facing wrapper
- `src/providers/mock/` — original reference `MockDataProvider`, kept for comparison
- `src/server/` — Hono app: pre-validation → `paymentMiddleware` → handler (unchanged)
- `scripts/e2e-pay.ts` — live client running the full `402 → pay → 200` flow against `dcs-score`

Swap data source: one line in `src/providers/index.ts` (`DATA_PROVIDER=zacca-credit` vs `mock`). Swap facilitator: change `FACILITATOR_URL`.

## 6. Target architecture — full decentralization for stablecoin lending (post-bounty roadmap)

None of this is required for the 2026-07-31 submission. It's the direction the "production swap points" in §4 and §5 are already aimed at, written out explicitly. Four pieces move from off-chain/API-based to smart-contract-based, so that an autonomous lender can extend stablecoin credit directly against verifiable on-chain state instead of trusting a centralized backend.

**Chain-agnostic by design.** Everything below is described against Hedera because that's this repo's bounty-driven reference implementation — but none of it should be architected as Hedera-only. Cross-border stablecoin fintechs (HoneyCoin, Kotani Pay, Due Wallet, MyEtherWallet-style wallets, and similar) already settle on whatever chain fits their corridor — Celo, Polygon, Stellar-based rails, Tron, Ethereum L2s, Hedera itself — and Zacca's credit-intelligence layer needs to sit underneath all of them rather than force a chain migration onto a partner. Concretely, the VBR Registry, Statement Registry, and `CreditLine` (§6.1, §6.2, §6.4) are specified as an **interface** — `attest(claimHash, expiry, signature)`, `read(businessId) → Attestation`, `decide(businessId, dcsAttestation) → CreditDecision` — not a Hedera contract. Hedera Smart Contract Service is the first adapter implementing that interface; a Celo, Polygon, or Stellar adapter is a second implementation of the same interface, not a rewrite. The ICM scoring pipeline (§6.3) never talks to a chain directly — it consumes and produces attestations — so it's chain-agnostic by construction; only the pipeline's intake and attest stages touch a chain adapter. See §7 for how this becomes something partners actually integrate against.

### 6.1 VBR lookup — decentralized bureau attestation registry

Today `vbr-lookup` is a seeded-PRNG stand-in for a live call to Zacca's own VBR Data Rail. The target is a **VBR Registry** — implemented against the `attest`/`read` interface from the chain-agnostic design principle above, deployed first on Hedera (Smart Contract Service) — that holds no raw bureau data itself, only attestations:
- Each credit bureau or data source (TransUnion, Experian/Equifax-equivalents, local African credit bureaus, mobile-money operators) runs — or delegates to — an **attestor** that signs a claim ("business X has a verified record, hash H, as of consensus timestamp T") and submits it to the registry contract.
- The claim's hash is anchored via Hedera Consensus Service (HCS) for a tamper-evident, ordered audit trail; the underlying PII/report never touches the chain.
- Bureaus that don't operate on Hedera — or whose data pipeline runs on a different chain entirely — are reached through a **cross-chain attestation bridge**: a relayer + verification pattern (signed-message / Merkle-proof bridge) that lets the VBR Registry contract trust an attestation that originated off-Hedera without a centralized custodian re-signing it.
- `vbr-lookup` becomes a contract read (does an unexpired, quorum-satisfying attestation exist for this business?) instead of an API call — verifiable by any third party, not just Zacca's backend.

### 6.2 Payment / fintech transaction statements — decentralized statement attestation

Same attest-then-verify pattern applied to cash-flow evidence:
- Bank and fintech statement data (Plaid-equivalent aggregators, mobile-money statements, POS transaction exports, and — for partners integrating per §7 — the partner's own transaction records) gets hashed and attested into a **Statement Registry**, the same `attest`/`read` interface as §6.1, with the raw statement kept off-chain (encrypted, business-controlled) and only the attestation — hash, period, the aggregate stats needed for scoring — on-chain.
- Where the transaction history is *already* native to a chain (e.g. the business's own stablecoin inflows/outflows), the registry doesn't need an attestor at all; it reads the ledger directly — Hedera-native activity directly, other chains' activity via the same cross-chain attestation bridge used for bureau data in §6.1. This is the strongest evidence tier, since there's no attestor trust assumption: the transactions are the primary source.

### 6.3 DCS scoring — LLM-driven deep reasoning, structured as an ICM workspace

Stage 1's rule-based `dcs-scoring.ts` (§4) is a deterministic formula. The target scoring engine replaces/augments it with an LLM reasoning pass — engineered using **Interpretable Context Methodology (ICM)** rather than one monolithic prompt, so the reasoning is both reliable/cost-effective and independently auditable. An ICM workspace is a sequence of numbered stage folders, each scoped to one job and each carrying its own `CONTEXT.md` that tells the agent exactly what stage it's in, what inputs it's allowed to use, and what output it must produce:

- `01-intake/` — pulls the on-chain evidence for the business: the VBR attestation (§6.1), statement attestations plus aggregate stats (§6.2), any native transaction history, and Zacca's existing Stage 1/Stage 2 feature set (cash-flow, stability, customer-behaviour, operational features from the concept-paper methodology). `CONTEXT.md` here defines the input contract as "verified attestation, any origin chain" — it doesn't assume everything is Hedera-native, since evidence can arrive via the §6.1/§6.2 cross-chain attestation bridge.
- `02-cross-check/` — cross-references the bureau attestation against the statement-derived cash-flow picture, flags inconsistencies (e.g. claimed revenue vs. observed inflows), and outputs a structured evidence-quality note.
- `03-reasoning/` — the deep, multi-step credit-reasoning pass itself: weighs the evidence plus the cross-check note, applies the concept-paper DCS methodology, and drafts a 0–100 score with a step-by-step rationale.
- `04-review/` — a self-critique pass that checks the draft score/rationale for internal consistency and methodology compliance before anything is finalized, catching reasoning errors before they're committed on-chain.
- `05-attest/` — finalizes score + rationale, hashes them (along with each stage's `CONTEXT.md` + input/output pair), and commits the attestation to HCS.

Two things fall out of structuring it this way rather than a single-shot classification:
- Each stage only sees the inputs its `CONTEXT.md` grants it, not the whole history — keeping each call right-sized (cheaper, more reliable) instead of one giant prompt trying to do intake, cross-checking, reasoning, and review at once.
- The ICM stage outputs *are* the audit trail: a disputed score can be traced stage-by-stage (what evidence went into `01-intake`, what inconsistencies `02-cross-check` flagged, how `03-reasoning` weighed them) rather than re-derived from one opaque completion. That's what makes "the justification for a score is auditable on-chain, not just the number" (the usual blocker to decentralized underwriting) actually true rather than aspirational.

`dcs-score` becomes: run (or read a cached, unexpired) ICM pipeline for the business → return score + rationale hash, with the full stage-by-stage rationale retrievable off-chain by hash.

### 6.4 Credit limit — autonomous on-chain decisioning enabling stablecoin lending

Today `credit-limit` computes `Monthly Turnover × Risk Multiplier` in-process. The target is a **`CreditLine`** — the `decide` interface from the chain-agnostic design principle above, deployed first on Hedera:
- Reads the current DCS attestation (§6.3) for a business directly from the chain — no API call back into a centralized scoring service.
- Applies the limit/tenure formula (or a governance-upgradable version of it) as contract logic, so the credit-limit *decision* is itself verifiable, not just its output.
- On approval, the contract can disburse or open a line of credit **directly in stablecoin** — via whichever chain adapter matches the borrower's or partner's settlement rail (USDC via Hedera HTS, cUSD on Celo, USDC on Polygon, etc., §7) — to the borrower's wallet, collapsing "get scored" → "get approved" → "get funded" into one on-chain flow with no centralized loan-ops step in between.
- This is what makes §6.1–6.3 matter in the first place: a score or a VBR check that lives off-chain can't be trusted by an autonomous lending contract. Once all of it is attested or computed on-chain, a lender — a human-run pool, another autonomous agent, or an integrating fintech partner (§7) — can extend stablecoin credit purely against contract state.

### 6.5 Sequencing note

Each of 6.1–6.4 has a natural "attest off-chain, verify on-chain" halfway state before full decentralization (e.g. Zacca's own backend acting as the sole attestor before multi-bureau attestor quorums exist). The realistic order is Stage 1 (this bounty demo — rule-based, fully off-chain, §4) → Stage 2 (rule-based scoring replaced by the ICM-structured LLM pipeline from §6.3, still centrally-triggered, attestations written but not yet contract-gated — note that adopting ICM doesn't depend on the rest of decentralization landing first, it's a prompt-engineering change) → Stage 3 (attestor quorums + cross-chain attestation bridges + autonomous `CreditLine` contract, §6.1–6.4 in full) — not a single leap. The `syntheticFeaturesFor()` swap point (§4) and the provider-swap point (§5) are where this migration begins.

## 7. Partner integration layer — SDKs & API docs for stablecoin fintechs

The x402-gated REST API (§1, §3) is the source of truth, but asking a partner fintech to hand-roll "detect 402 → pay → retry" against raw HTTP is the wrong integration surface for a production BNPL or lending flow. This section is what turns "Zacca has an API" into "cross-border stablecoin fintechs — HoneyCoin, Kotani Pay, Due Wallet, MyEtherWallet-style wallets, and similar — build stablecoin-lending and BNPL products on top of Zacca." It's downstream of §6 and depends on the chain-agnostic design principle stated there: a partner should be able to pay for and settle against Zacca in whatever stablecoin/chain they already hold, not be forced onto HBAR/Hedera.

### 7.1 What partners integrate against
- The three existing endpoints — `vbr-lookup`, `dcs-score`, `credit-limit` (§3) — stay the integration surface for credit intelligence; endpoint shapes don't change as the backing decentralizes (§3's note).
- Once §6.4 lands, a fourth surface — credit disbursement/repayment against `CreditLine` (or its chain adapter) — becomes available for partners who want Zacca to originate/fund the line directly, not just score it: actual embedded stablecoin lending or BNPL, not a data check.

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

## 8. Remaining work — sequenced checklist (bounty scope, Stage 1)

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

**Step 3 — publish**
- Push to a public GitHub repo (bounty hard requirement).
- Keep README's "why this matters beyond the bounty" framing — Zacca repositioning as credit-intelligence infrastructure, not just an MSME lending app.

**Step 4 — demo video (<5 min)**
- Show `GET /catalog`.
- Trigger a `402` on `dcs-score`.
- Show payment settling via the client script.
- Show the resulting HashScan transaction.
- Narrate as "Zacca's Credit Intelligence API, agent-payable on Hedera" — tie back to the underwriting-engine use case (a lender's agent paying per score instead of a flat data subscription), matching the bounty's own reference-architecture framing.

**Step 5 — submit**
- Submission form, repo link, demo video, HashScan links — before 2026-07-31 11:59 PM ET.

## 9. Known limitations (Stage 1 demo, disclosed transparently in submission)

- Features are synthetic (seeded by `businessId`), not yet backed by the real VBR Data Rail — see the production swap-point note above and the decentralized VBR/statement registries in §6.1–6.2.
- `settle` runs after the handler returns 200, matching the reference architecture's current behavior (acceptable for testnet).
- No HCS attestation of scoring decisions yet — this is exactly the reasoning-trace attestation described in §6.3, planned as part of the Agentic Underwriting Engine's audit-trail layer (parent plan, Product 3 / §7 Trust & Verification).
- Scoring is deterministic/rule-based, not yet LLM-driven, and credit-limit decisioning runs in-process rather than as autonomous on-chain contract logic — see §6.3–6.4 for the target.
- Payment settlement is HBAR-on-Hedera only (`blocky402`, `PAY_TO_ACCOUNT`); the chain-agnostic design (§6 intro) and multi-chain facilitator support (§7) needed for cross-border stablecoin fintech partners aren't built yet.
- No partner-facing SDKs, API docs site, or OpenAPI spec yet — see §7.

## 10. Open dependency carried over from the parent plan

Per the ecosystem-level implementation plan's §11: any code patterns reused from prior collaborations must be cleanly separated/re-implemented before shipping under the Zacca name. This repo forks a third-party bounty reference (`matevszm/x402-hedera-example`, MIT-style bounty reference — verify license terms before public repo push) for the x402/Hedera plumbing only; the `CreditScoreProvider` and `dcs-scoring.ts` are original Zacca logic and are the actual submission asset.
