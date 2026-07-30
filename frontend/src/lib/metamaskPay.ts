/**
 * MetaMask (or any EIP-1193 wallet) payment path -- a plain HBAR value
 * transfer via eth_sendTransaction, verified server-side by transaction
 * receipt instead of the native Hedera TransferTransaction the pasted-key
 * flow (payClient.ts) produces. See src/server/evm-payment.ts for why this
 * is a parallel path, not a literal x402 scheme extension: MetaMask can't
 * sign Hedera's native protobuf transactions, only standard EVM ones.
 */
import { API_BASE_URL } from "./config";
import type { PayResult, PayStep } from "./payClient";

const HEDERA_TESTNET_CHAIN_ID_HEX = "0x128"; // 296
const WEIBAR_PER_TINYBAR = 10n ** 10n;

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

function getEthereum(): Eip1193Provider {
  const eth = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  if (!eth) {
    throw new Error("No MetaMask (or other EIP-1193 wallet) detected in this browser.");
  }
  return eth;
}

/** Same long-zero address derivation as src/server/evm-payment.ts's hederaAccountIdToEvmAddress. */
function hederaAccountIdToEvmAddress(accountId: string): string {
  const num = BigInt(accountId.split(".")[2] ?? accountId);
  return "0x" + num.toString(16).padStart(40, "0");
}

async function ensureHederaTestnet(eth: Eip1193Provider): Promise<void> {
  const currentChainId = await eth.request({ method: "eth_chainId" });
  if (currentChainId === HEDERA_TESTNET_CHAIN_ID_HEX) return;

  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: HEDERA_TESTNET_CHAIN_ID_HEX }],
    });
  } catch {
    // Not added to the wallet yet -- add it.
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: HEDERA_TESTNET_CHAIN_ID_HEX,
          chainName: "Hedera Testnet",
          nativeCurrency: { name: "HBAR", symbol: "HBAR", decimals: 18 },
          rpcUrls: ["https://testnet.hashio.io/api"],
          blockExplorerUrls: ["https://hashscan.io/testnet"],
        },
      ],
    });
  }
}

export async function runMetaMaskPaidRequest(
  productId: string,
  businessId: string,
  priceTinybars: string,
  payToAccountId: string,
  onStep: (step: PayStep) => void,
  extraParams: Record<string, string> = {},
): Promise<PayResult> {
  const steps: PayStep[] = [];
  const record = (label: string, detail?: string) => {
    const step = { label, detail };
    steps.push(step);
    onStep(step);
  };

  const eth = getEthereum();

  record("Connecting wallet", "Requesting account access");
  const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  const from = accounts[0];
  if (!from) throw new Error("No account returned by wallet");

  record("Checking network", "Ensuring Hedera testnet (chainId 296) is selected");
  await ensureHederaTestnet(eth);

  const to = hederaAccountIdToEvmAddress(payToAccountId);
  const value = BigInt(priceTinybars) * WEIBAR_PER_TINYBAR;
  const valueHex = "0x" + value.toString(16);

  record("Sending payment", `${from} -> ${to}, ${priceTinybars} tinybars`);
  const txHash = (await eth.request({
    method: "eth_sendTransaction",
    params: [{ from, to, value: valueHex }],
  })) as string;
  record("Transaction submitted", txHash);

  record("Waiting for confirmation", "Polling for the transaction receipt");
  const receipt = await waitForReceipt(eth, txHash);
  if (!receipt) throw new Error("Transaction was not confirmed in time");
  record("Transaction confirmed", `status: ${receipt.status}`);

  const extra = Object.entries(extraParams)
    .map(([k, v]) => `&${k}=${encodeURIComponent(v)}`)
    .join("");
  const url = `${API_BASE_URL}/data/${productId}?businessId=${encodeURIComponent(businessId)}&txHash=${txHash}${extra}`;

  record("Verifying payment with Zacca", url);
  const res = await fetch(url);
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(typeof body.reason === "string" ? body.reason : `HTTP ${res.status}`);
  }
  record(`Received HTTP ${res.status}`, "Payment verified server-side, resource unlocked");

  return { steps, body, settlement: { success: true, transactionHash: txHash } };
}

async function waitForReceipt(
  eth: Eip1193Provider,
  txHash: string,
  timeoutMs = 30_000,
): Promise<{ status: string } | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const receipt = (await eth.request({
      method: "eth_getTransactionReceipt",
      params: [txHash],
    })) as { status: string } | null;
    if (receipt) return receipt;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  return null;
}
