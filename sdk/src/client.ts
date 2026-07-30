import { Contract, JsonRpcProvider, type Signer as EthersSigner } from "ethers";
import type { Network } from "@x402/core/types";
import { EvmWalletSigner, HederaKeySigner, type PaymentSigner } from "./signers.js";
import type {
  CatalogResponse,
  CreditLimitResponse,
  DcsScoreResponse,
  DeploymentContracts,
  LoanTerms,
  VbrInputResponse,
  VbrLookupResponse,
} from "./types.js";

export interface ZaccaClientOptions {
  /** Base URL of a deployed Zacca Credit Intelligence API, e.g. "https://pay-api.zacca.ai". */
  apiBaseUrl: string;
  signer: PaymentSigner;
  /** Hedera JSON-RPC relay, only needed for the read-only on-chain helpers (readCreditLine, readLoanTerms). */
  rpcUrl?: string;
}

const CREDIT_LINE_ABI = ["function creditLimit(string businessId) view returns (uint256, uint16)"];
const LENDING_ADAPTER_ABI = [
  "function getLoanTerms(string businessId) view returns (tuple(bool eligible, uint8 dcs, string riskTier, uint16 maxLoanToValueBps, uint16 suggestedInterestRateBps))",
];

/**
 * SDK for wallets, BNPL checkouts, and lending protocols to integrate
 * Zacca's Credit Intelligence API. Wraps the x402 pay-per-query flow (via
 * either signer) and exposes typed results for vbr-lookup/dcs-score/
 * credit-limit, plus free helpers (submitVbrData) and read-only on-chain
 * helpers that don't need a paid API call at all (readCreditLine,
 * readLoanTerms) for systems that just want to query Zacca's attested data
 * directly.
 */
export class ZaccaClient {
  private catalogCache: CatalogResponse | null = null;
  private contractsCache: DeploymentContracts | null = null;

  constructor(private readonly opts: ZaccaClientOptions) {}

  static withHederaKey(apiBaseUrl: string, accountId: string, privateKeyHex: string, network?: Network): ZaccaClient {
    return new ZaccaClient({ apiBaseUrl, signer: new HederaKeySigner(accountId, privateKeyHex, network) });
  }

  static withEvmWallet(apiBaseUrl: string, signer: EthersSigner): ZaccaClient {
    return new ZaccaClient({ apiBaseUrl, signer: new EvmWalletSigner(signer) });
  }

  async catalog(): Promise<CatalogResponse> {
    if (this.catalogCache) return this.catalogCache;
    const res = await fetch(`${this.opts.apiBaseUrl}/catalog`);
    if (!res.ok) throw new Error(`GET /catalog failed: ${res.status}`);
    this.catalogCache = (await res.json()) as CatalogResponse;
    return this.catalogCache;
  }

  /** Deployed contract addresses (no secrets) -- backs the read-only helpers below. */
  async contracts(): Promise<DeploymentContracts> {
    if (this.contractsCache) return this.contractsCache;
    const res = await fetch(`${this.opts.apiBaseUrl}/contracts`);
    if (!res.ok) throw new Error(`GET /contracts failed: ${res.status}`);
    this.contractsCache = (await res.json()) as DeploymentContracts;
    return this.contractsCache;
  }

  private async paidGet<T>(productId: string, params: Record<string, string>): Promise<T> {
    const catalog = await this.catalog();
    const product = catalog.products.find((p) => p.id === productId);
    if (!product) throw new Error(`Unknown product "${productId}". Available: ${catalog.products.map((p) => p.id).join(", ")}`);

    const qs = new URLSearchParams(params).toString();
    const url = `${this.opts.apiBaseUrl}${product.endpoint}?${qs}`;
    const res = await this.opts.signer.payAndFetch(url, product.priceTinybars, catalog.payTo);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`${productId} request failed: HTTP ${res.status} ${text}`);
    }
    return res.json() as Promise<T>;
  }

  vbrLookup(businessId: string): Promise<VbrLookupResponse> {
    return this.paidGet<VbrLookupResponse>("vbr-lookup", { businessId });
  }

  dcsScore(businessId: string, opts: { oracle?: "pyth" | "supra" } = {}): Promise<DcsScoreResponse> {
    return this.paidGet<DcsScoreResponse>("dcs-score", {
      businessId,
      ...(opts.oracle ? { oracle: opts.oracle } : {}),
    });
  }

  creditLimit(
    businessId: string,
    opts: { oracle?: "pyth" | "supra"; stablecoin?: "zusd" | "usdc" } = {},
  ): Promise<CreditLimitResponse> {
    return this.paidGet<CreditLimitResponse>("credit-limit", {
      businessId,
      ...(opts.oracle ? { oracle: opts.oracle } : {}),
      ...(opts.stablecoin ? { stablecoin: opts.stablecoin } : {}),
    });
  }

  /** Free -- submits a business's own evidence for Zacca's backend to review and attest on-chain. */
  async submitVbrData(input: {
    businessId: string;
    businessName: string;
    yearsInBusiness?: number;
    sector?: string;
  }): Promise<VbrInputResponse> {
    const res = await fetch(`${this.opts.apiBaseUrl}/vbr-input`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`vbr-input failed: HTTP ${res.status} ${JSON.stringify(body)}`);
    }
    return res.json() as Promise<VbrInputResponse>;
  }

  /** Free, direct on-chain read (no x402 payment) -- for a wallet re-checking status it already paid for once. */
  async readCreditLine(
    businessId: string,
    stablecoin: "zusd" | "usdc" = "zusd",
  ): Promise<{ limitStablecoinUnits: bigint; maxTenureMonths: number } | null> {
    const contracts = await this.contracts();
    const address = stablecoin === "usdc" ? contracts.CreditLineUsdc : contracts.CreditLine;
    if (!address) return null;
    const provider = new JsonRpcProvider(this.opts.rpcUrl ?? "https://testnet.hashio.io/api");
    const creditLine = new Contract(address, CREDIT_LINE_ABI, provider);
    try {
      const [limit, maxTenureMonths] = await creditLine.getFunction("creditLimit")(businessId);
      return { limitStablecoinUnits: BigInt(limit), maxTenureMonths: Number(maxTenureMonths) };
    } catch {
      return null;
    }
  }

  /**
   * Free, direct on-chain read of the protocol-agnostic LendingAdapter --
   * this is what a third-party lending protocol (or its keeper bots) would
   * call to price an undercollateralized loan against Zacca's DCS
   * attestation, without needing an API key, payment, or any relationship
   * with Zacca at call time.
   */
  async readLoanTerms(businessId: string): Promise<LoanTerms | null> {
    const contracts = await this.contracts();
    if (!contracts.LendingAdapter) return null;
    const provider = new JsonRpcProvider(this.opts.rpcUrl ?? "https://testnet.hashio.io/api");
    const adapter = new Contract(contracts.LendingAdapter, LENDING_ADAPTER_ABI, provider);
    const terms = await adapter.getFunction("getLoanTerms")(businessId);
    return {
      eligible: terms.eligible,
      dcs: Number(terms.dcs),
      riskTier: terms.riskTier,
      maxLoanToValueBps: Number(terms.maxLoanToValueBps),
      suggestedInterestRateBps: Number(terms.suggestedInterestRateBps),
    };
  }
}
