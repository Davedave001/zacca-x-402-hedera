/**
 * Client-side x402 payment flow -- the same 402 -> sign -> pay -> 200 round
 * trip as scripts/e2e-pay.ts, adapted for the browser. The pasted testnet
 * private key is used only in-memory, in this tab, to construct and sign a
 * Hedera TransferTransaction locally; it is never sent anywhere.
 */
import {
  decodePaymentResponseHeader,
  wrapFetchWithPayment,
  x402Client,
} from "@x402/fetch";
import { PrivateKey, createClientHederaSigner } from "@x402/hedera";
import { ExactHederaScheme } from "@x402/hedera/exact/client";
import type { Network } from "@x402/core/types";
import { API_BASE_URL } from "./config";

const NETWORK: Network = "hedera:testnet";

export interface PayStep {
  label: string;
  detail?: string;
}

export interface PayResult {
  steps: PayStep[];
  body: Record<string, unknown>;
  settlement: { success: boolean; transactionHash?: string } | null;
}

export class PayFlowError extends Error {
  readonly steps: PayStep[];

  constructor(message: string, steps: PayStep[]) {
    super(message);
    this.steps = steps;
  }
}

export interface PaidRequestOptions {
  /** Which live price oracle backs the reasoning/credit-limit conversion (dcs-score, credit-limit only). */
  oracleId?: "pyth" | "supra";
  /** Which CreditLine/disbursement stablecoin to report on (credit-limit only). */
  stablecoin?: "zusd" | "usdc";
}

/**
 * Runs the full paid flow for one product against the live API.
 *
 * @param productId catalog product id, e.g. "dcs-score"
 * @param businessId query param value
 * @param accountId funded Hedera testnet account id (e.g. "0.0.xxxx")
 * @param privateKeyHex DER or raw hex-encoded testnet private key, browser-local only
 * @param onStep called after each step so the UI can render progress live
 * @param options optional oracle/stablecoin selection
 */
export async function runPaidRequest(
  productId: string,
  businessId: string,
  accountId: string,
  privateKeyHex: string,
  onStep: (step: PayStep) => void,
  options: PaidRequestOptions = {},
): Promise<PayResult> {
  const steps: PayStep[] = [];
  const record = (label: string, detail?: string) => {
    const step = { label, detail };
    steps.push(step);
    onStep(step);
  };

  const extraParams =
    (options.oracleId ? `&oracle=${options.oracleId}` : "") +
    (options.stablecoin ? `&stablecoin=${options.stablecoin}` : "");
  const url = `${API_BASE_URL}/data/${productId}?businessId=${encodeURIComponent(businessId)}${extraParams}`;

  record("Requesting without payment", url);
  const unpaid = await fetch(url);
  if (unpaid.status !== 402) {
    const text = await unpaid.text().catch(() => "");
    throw new PayFlowError(`Expected HTTP 402, got ${unpaid.status}: ${text}`, steps);
  }
  record(`Received HTTP 402`, "Payment required -- constructing signed transfer transaction");

  let signer;
  try {
    signer = createClientHederaSigner(accountId, PrivateKey.fromString(privateKeyHex), {
      network: NETWORK,
    });
  } catch (err) {
    throw new PayFlowError(
      `Could not parse account id / private key: ${err instanceof Error ? err.message : String(err)}`,
      steps,
    );
  }

  const client = new x402Client().register(NETWORK, new ExactHederaScheme(signer));
  const fetchWithPay = wrapFetchWithPayment(fetch, client);

  record("Signing payment locally", `Paying as ${accountId} on ${NETWORK}`);

  let paid: Response;
  try {
    paid = await fetchWithPay(url);
  } catch (err) {
    throw new PayFlowError(
      `Payment/signing failed: ${err instanceof Error ? err.message : String(err)}`,
      steps,
    );
  }

  if (!paid.ok) {
    const text = await paid.text().catch(() => "");
    throw new PayFlowError(`Paid request failed: HTTP ${paid.status} ${text}`, steps);
  }

  record(`Received HTTP ${paid.status}`, "Payment settled");

  const body = (await paid.json()) as Record<string, unknown>;

  let settlement: PayResult["settlement"] = null;
  const settlementHeader = paid.headers.get("PAYMENT-RESPONSE");
  if (settlementHeader) {
    const decoded = decodePaymentResponseHeader(settlementHeader);
    settlement = {
      success: decoded.success,
      transactionHash: decoded.transaction,
    };
    if (decoded.transaction) {
      record("Settlement confirmed on-chain", decoded.transaction);
    }
  }

  return { steps, body, settlement };
}
