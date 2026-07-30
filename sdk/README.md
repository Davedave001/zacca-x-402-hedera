# @zacca/sdk

SDK for stablecoin wallets, BNPL checkouts, and lending protocols to
integrate [Zacca's Credit Intelligence API](../README.md) -- a pay-per-query,
x402-gated credit-scoring service backed by real smart contracts on Hedera
testnet. See the parent repo's `IMPLEMENTATION_PLAN.md` §12 for full
architecture detail and live-verification evidence.

## Install (from source, not yet published)

```bash
cd sdk
npm install
npm run build
```

## Two ways to pay, one client API

A wallet integrator picks whichever signer matches how their users hold
keys -- the rest of the API (`vbrLookup`, `dcsScore`, `creditLimit`) is
identical either way.

### A Hedera-native key (ED25519/ECDSA)

```ts
import { ZaccaClient } from "@zacca/sdk";

const zacca = ZaccaClient.withHederaKey(
  "https://pay-api.zacca.ai",
  "0.0.xxxxx",       // funded Hedera account id
  "302e0201...",     // DER or raw hex private key
);

const score = await zacca.dcsScore("biz-alice-mboga");
console.log(score.dcs, score.riskTier);
```

### Any EVM wallet (MetaMask, or an ethers Signer)

```ts
import { ZaccaClient } from "@zacca/sdk";
import { BrowserProvider } from "ethers";

const provider = new BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

const zacca = ZaccaClient.withEvmWallet("https://pay-api.zacca.ai", signer);
const score = await zacca.dcsScore("biz-alice-mboga");
```

Under the hood this sends a plain HBAR value transfer (what MetaMask
actually produces) and Zacca's backend verifies it by transaction receipt
-- see `src/server/evm-payment.ts` in the parent repo for why this is a
deliberate, parallel payment path rather than a literal x402 scheme
extension (MetaMask can't sign the native Hedera transaction the main flow
uses).

## API

```ts
zacca.catalog(): Promise<CatalogResponse>

zacca.vbrLookup(businessId: string): Promise<VbrLookupResponse>

zacca.dcsScore(businessId: string, opts?: {
  oracle?: "pyth" | "supra";   // which live price oracle backs the reasoning
}): Promise<DcsScoreResponse>

zacca.creditLimit(businessId: string, opts?: {
  oracle?: "pyth" | "supra";
  stablecoin?: "zusd" | "usdc"; // which CreditLine/disbursement asset to report
}): Promise<CreditLimitResponse>
```

### Free (no x402 payment)

```ts
// Submit your own business evidence -- Zacca's backend reviews and attests
// it on-chain (not a self-attestation; see IMPLEMENTATION_PLAN.md §12.3).
await zacca.submitVbrData({
  businessId: "biz-your-name",
  businessName: "Alice's Deliveries",
  yearsInBusiness: 2,
  sector: "gig-delivery",
});

// Direct on-chain reads -- no payment, no API round trip beyond one JSON-RPC call.
await zacca.readCreditLine("biz-alice-mboga", "usdc");
await zacca.readLoanTerms("biz-alice-mboga");
```

## For lending protocols: `readLoanTerms`

`readLoanTerms(businessId)` reads Zacca's `LendingAdapter` contract directly
on-chain -- a protocol-agnostic view function any Aave-fork-style money
market (or its keeper bots) can call to price an undercollateralized loan
against a business's DCS attestation, with no API key, payment, or
relationship with Zacca required at call time:

```ts
const terms = await zacca.readLoanTerms("biz-alice-mboga");
// { eligible: true, dcs: 96, riskTier: "A", maxLoanToValueBps: 9000, suggestedInterestRateBps: 821 }
```

A lending protocol's own contracts can call `LendingAdapter.getLoanTerms()`
directly in Solidity too -- the SDK method is a convenience for off-chain
systems (backends, keeper bots) that would rather not hand-roll the ethers
call. See `IMPLEMENTATION_PLAN.md` §12.5 for why this is deliberately a
protocol-agnostic reference interface rather than a live integration with a
specific third-party protocol's contracts.

## Types

All response shapes (`CatalogResponse`, `VbrLookupResponse`, `DcsScoreResponse`,
`CreditLimitResponse`, `LoanTerms`, etc.) are exported from `@zacca/sdk` --
see `src/types.ts`.
