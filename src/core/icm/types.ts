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
  creditLimitTinybars: bigint;
  maxTenureMonths: number;
  rationaleHash: string;
  onChain: { transactionHash: string } | null;
}
