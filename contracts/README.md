# Zacca Credit Intelligence — decentralized registries & CreditLine

Solidity/Hardhat implementation of implementation plan §6: the VBR/Statement/DCS
attestation registries and the `CreditLine` autonomous credit-limit +
stablecoin-disbursement contract, deployed to Hedera testnet (EVM-compatible
via Hedera's Smart Contract Service).

## Contracts

| Contract | Plan section | Purpose |
|---|---|---|
| `VBRRegistry` | §6.1 | Bureau attestation registry — claim hash only, no raw bureau data |
| `StatementRegistry` | §6.2 | Payment/fintech statement attestation — hash + aggregate cash-flow stats |
| `DCSRegistry` | §6.3 | On-chain attestation of the ICM pipeline's scoring output |
| `MockStablecoin` (zUSD) | §6.4 | Testnet stand-in for a real stablecoin (USDC, etc.) |
| `CreditLine` | §6.4 | Reads the DCS attestation, computes the limit, disburses zUSD on `draw()` |

`VBRRegistry`, `StatementRegistry` and `DCSRegistry` all implement the same
`IAttestationRegistry` interface (`attest` / `read` / `isValid`) — the
chain-agnostic design principle from plan §6: Hedera is the first adapter,
not a hard dependency.

## Why a separate ECDSA key

Hedera accounts created via the Hedera Portal (or most wallets) default to
**ED25519** keys — the ones in the parent project's `.env`
(`HEDERA_CLIENT_KEY`, `PAY_TO_ACCOUNT`). Hardhat deploys/signs via Hedera's
EVM JSON-RPC relay, which requires a standard **ECDSA (secp256k1)** key, like
any other EVM chain. ED25519 keys cannot sign EVM JSON-RPC transactions.

The deployer key here (`HEDERA_TESTNET_DEPLOYER_KEY`) was generated fresh and
funded by transferring HBAR from the existing ED25519 client account to its
computed EVM address — Hedera auto-creates a real account the first time an
EVM address receives a transfer. No second Hedera Portal signup was needed.

This same key is the deployer, `owner`, and default `attestor` on all three
registries, and the `registrar` on `CreditLine` — i.e. it's Zacca's own
backend acting as the sole attestor (plan §6.5's Stage 2 halfway state, not
yet a multi-bureau attestor quorum).

## Commands

```bash
npm install
npm run compile
npm test                              # 14 unit tests
npm run deploy:testnet                # writes deployments/hederaTestnet.json
```

Deployed addresses are committed in `deployments/hederaTestnet.json` (no
secrets in it — just addresses). `.env` (the deployer private key) is
gitignored.

## Consumed by

`src/chain/client.ts` in the parent project reads `deployments/hederaTestnet.json`
and talks to these contracts via `ethers` over the same JSON-RPC relay
(`https://testnet.hashio.io/api`), backing the `zacca-decentralized`
`DataProvider` (`src/providers/decentralized/`).
