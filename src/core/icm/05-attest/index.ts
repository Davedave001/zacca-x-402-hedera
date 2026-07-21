import { AbiCoder, keccak256, toUtf8Bytes } from "ethers";
import { TIER_POLICIES } from "../../dcs-scoring.js";
import type { AttestResult, ChainWriter, IntakeResult, ReviewResult } from "../types.js";

const abiCoder = AbiCoder.defaultAbiCoder();
const ATTESTATION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

/** See CONTEXT.md -- computes limit/tenure, hashes the rationale, writes the attestation. */
export async function attest(
  businessId: string,
  intake: IntakeResult,
  review: ReviewResult,
  chain: ChainWriter,
): Promise<AttestResult> {
  const policy = TIER_POLICIES.find((t) => t.tier === review.riskTier) ?? TIER_POLICIES[TIER_POLICIES.length - 1]!;
  const monthlyTurnoverTinybars = intake.statement?.monthlyTurnoverTinybars ?? 0n;
  const creditLimitTinybars = BigInt(Math.round(Number(monthlyTurnoverTinybars) * policy.riskMultiplier));
  const maxTenureMonths = policy.riskMultiplier > 0 ? Math.max(1, Math.round(policy.maxTenureDays / 30)) : 0;

  const rationaleHash = keccak256(toUtf8Bytes(review.rationale.join("\n")));

  const extra = abiCoder.encode(
    ["uint8", "uint16", "string", "uint256", "uint16"],
    [review.dcs, review.probabilityOfDefaultBps, review.riskTier, creditLimitTinybars, maxTenureMonths],
  );

  const expiresAt = Math.floor(Date.now() / 1000) + ATTESTATION_TTL_SECONDS;
  const receipt = await chain.attestDcs(businessId, rationaleHash, expiresAt, extra);

  return {
    ...review,
    businessId,
    creditLimitTinybars,
    maxTenureMonths,
    rationaleHash,
    onChain: receipt,
  };
}
