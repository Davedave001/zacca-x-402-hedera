/**
 * Two payment mechanisms, one interface -- a wallet integrator picks
 * whichever matches how their users hold keys:
 *
 * - HederaKeySigner: signs the native Hedera TransferTransaction the x402
 *   "exact" Hedera scheme expects (same mechanism as the parent repo's
 *   scripts/e2e-pay.ts). For wallets holding an ED25519/ECDSA Hedera key
 *   directly.
 * - EvmWalletSigner: sends a plain EVM value transfer (what MetaMask and
 *   any standard EIP-1193/ethers Signer produces) and lets Zacca's backend
 *   verify it by transaction receipt instead -- see the parent repo's
 *   src/server/evm-payment.ts for why this is a parallel path, not a
 *   literal x402 scheme extension.
 */
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { PrivateKey, createClientHederaSigner } from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import type { Network } from "@x402/core/types";
import type { Signer as EthersSigner } from "ethers";

export interface PaymentSigner {
  /** Pays `priceTinybars` to `payToAccountId` and returns the (already-paid) fetch response for `url`. */
  payAndFetch(url: string, priceTinybars: string, payToAccountId: string): Promise<Response>;
}

export class HederaKeySigner implements PaymentSigner {
  constructor(
    private readonly accountId: string,
    private readonly privateKeyHex: string,
    private readonly network: Network = "hedera:testnet",
  ) {}

  async payAndFetch(url: string): Promise<Response> {
    const signer = createClientHederaSigner(this.accountId, PrivateKey.fromString(this.privateKeyHex), {
      network: this.network,
    });
    const client = new x402Client().register(this.network, new ExactHederaScheme(signer));
    const fetchWithPay = wrapFetchWithPayment(fetch, client);
    return fetchWithPay(url);
  }
}

const WEIBAR_PER_TINYBAR = 10n ** 10n;

/** Same derivation as the parent repo's src/server/evm-payment.ts / frontend's metamaskPay.ts. */
export function hederaAccountIdToEvmAddress(accountId: string): string {
  const num = BigInt(accountId.split(".")[2] ?? accountId);
  return "0x" + num.toString(16).padStart(40, "0");
}

export class EvmWalletSigner implements PaymentSigner {
  constructor(private readonly signer: EthersSigner) {}

  async payAndFetch(url: string, priceTinybars: string, payToAccountId: string): Promise<Response> {
    const to = hederaAccountIdToEvmAddress(payToAccountId);
    const value = BigInt(priceTinybars) * WEIBAR_PER_TINYBAR;

    const tx = await this.signer.sendTransaction({ to, value });
    const receipt = await tx.wait();
    if (!receipt || receipt.status !== 1) {
      throw new Error("EVM payment transaction failed or was not confirmed");
    }

    const separator = url.includes("?") ? "&" : "?";
    return fetch(`${url}${separator}txHash=${tx.hash}`);
  }
}
