/** Shared types passed between ICM pipeline stages. See README.md. */

export interface AttestationView {
  claimHash: string;
  issuedAt: number;
  expiresAt: number;
  attestor: string;
  revoked: boolean;
  extra: string; // 0x-prefixed abi-encoded bytes, "0x" when empty
}

/**
 * Chain-agnostic read/write surface the pipeline depends on -- matches the
 * attest/read/decide interface from the implementation plan's §6 "chain-agnostic
 * by design" principle. Stage 01 only reads; Stage 05 only writes.
 */
export interface ChainReader {
  readVbrAttestation(businessId: string): Promise<AttestationView | null>;
  readStatementAttestation(businessId: string): Promise<AttestationView | null>;
}

export interface ChainWriter {
  attestDcs(
    businessId: string,
    claimHash: string,
    expiresAtUnixSeconds: number,
    extra: string,
  ): Promise<{ transactionHash: string }>;
}

/**
 * Live price oracle surface (src/chain/oracles.ts) -- injected the same way
 * as ChainReader/ChainWriter, so the pipeline stays testable without a live
 * RPC call and swappable across oracle networks without touching stage logic.
 */
export interface OracleReader {
  getHbarUsdPrice(): Promise<OracleQuote>;
}

export interface OracleQuote {
  provider: string;
  pair: string;
  price: number;
  publishTime: number;
  ageSeconds: number;
}

export interface StatementStats {
  periodStart: number;
  periodEnd: number;
  monthlyTurnoverTinybars: bigint;
}

export interface IntakeResult {
  businessId: string;
  vbrAttested: boolean;
  vbrClaimHash: string | null;
  statementAttested: boolean;
  statement: StatementStats | null;
  oracle: OracleQuote | null;
}

export interface CrossCheckResult {
  evidenceQuality: "strong" | "moderate" | "weak";
  flags: string[];
}

export interface ReasoningDraft {
  dcs: number; // 0-100
  probabilityOfDefaultBps: number; // 0-10000
  riskTier: "A" | "B" | "C" | "D" | "E";
  rationale: string[]; // ordered chain-of-thought steps
}

export interface ReviewResult extends ReasoningDraft {
  reviewNotes: string[];
}

export interface AttestResult extends ReviewResult {
  businessId: string;
  /** Credit limit in the disbursed stablecoin's raw units (6 decimals), oracle-converted from HBAR turnover. */
  creditLimitStablecoinUnits: bigint;
  maxTenureMonths: number;
  rationaleHash: string;
  onChain: { transactionHash: string } | null;
  oracle: OracleQuote | null;
}
