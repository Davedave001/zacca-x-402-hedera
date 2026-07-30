/**
 * Alternate payment verification path for wallets that can't produce the
 * native Hedera TransferTransaction the x402 "exact" Hedera scheme expects
 * (src/server/app.ts's main /data/* flow) -- MetaMask and other standard
 * EVM wallets only sign plain Ethereum-style transactions. Hedera's EVM
 * JSON-RPC relay accepts a plain `eth_sendTransaction` with a `value` field
 * as a genuine native HBAR transfer (settled as a real CRYPTOTRANSFER, same
 * as any other Hedera transfer), so this verifies payment by inspecting the
 * transaction receipt/details instead of parsing a Hedera-protobuf transfer.
 *
 * This is NOT the x402 protocol's header/402-challenge dance -- it's a
 * parallel, purpose-built verification path for exactly this wallet
 * mismatch, documented as such rather than pretending it's a literal x402
 * scheme extension. See IMPLEMENTATION_PLAN.md §6.5 / README for the
 * rationale.
 */
import { JsonRpcProvider } from "ethers";

const RPC_URL = process.env.HEDERA_JSON_RPC_URL ?? "https://testnet.hashio.io/api";
let _provider: JsonRpcProvider | null = null;
function provider(): JsonRpcProvider {
  if (!_provider) _provider = new JsonRpcProvider(RPC_URL);
  return _provider;
}

/** 1 HBAR = 10^8 tinybars = 10^18 weibar (Hedera's EVM value unit, matching Ethereum's wei naming). */
const WEIBAR_PER_TINYBAR = 10n ** 10n;

/** Converts a Hedera account id ("0.0.X") to its deterministic long-zero EVM address. */
export function hederaAccountIdToEvmAddress(accountId: string): string {
  const parts = accountId.split(".");
  const num = BigInt(parts[2] ?? accountId);
  return "0x" + num.toString(16).padStart(40, "0");
}

// Tx hashes already used to pay for a resource -- prevents replaying the same
// on-chain transfer to buy multiple responses. In-memory only: acceptable for
// a single-process testnet demo, not a production replay-protection design.
const usedTxHashes = new Set<string>();

export class EvmPaymentError extends Error {}

/**
 * Verifies a MetaMask-style EVM transaction actually paid `requiredTinybars`
 * to `payToAccountId`, and hasn't been used before. Throws EvmPaymentError
 * with a human-readable reason on any failure.
 */
export async function verifyEvmPayment(
  txHash: string,
  requiredTinybars: bigint,
  payToAccountId: string,
): Promise<{ from: string; value: bigint }> {
  if (usedTxHashes.has(txHash)) {
    throw new EvmPaymentError("Transaction already used to pay for a resource");
  }

  const [tx, receipt] = await Promise.all([provider().getTransaction(txHash), provider().getTransactionReceipt(txHash)]);
  if (!tx || !receipt) {
    throw new EvmPaymentError("Transaction not found (not yet mined, or wrong network)");
  }
  if (receipt.status !== 1) {
    throw new EvmPaymentError("Transaction failed on-chain");
  }

  const expectedTo = hederaAccountIdToEvmAddress(payToAccountId).toLowerCase();
  if (!tx.to || tx.to.toLowerCase() !== expectedTo) {
    throw new EvmPaymentError(`Transaction recipient does not match PAY_TO_ACCOUNT (expected ${expectedTo})`);
  }

  const requiredWeibar = requiredTinybars * WEIBAR_PER_TINYBAR;
  if (tx.value < requiredWeibar) {
    throw new EvmPaymentError(`Transaction value too low: sent ${tx.value} weibar, required ${requiredWeibar}`);
  }

  usedTxHashes.add(txHash);
  return { from: tx.from, value: tx.value };
}
