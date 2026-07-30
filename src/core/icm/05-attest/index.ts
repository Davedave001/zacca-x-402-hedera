import { AbiCoder, keccak256, toUtf8Bytes } from "ethers";
import { TIER_POLICIES } from "../../dcs-scoring.js";
import type { AttestResult, ChainWriter, IntakeResult, ReviewResult } from "../types.js";

const abiCoder = AbiCoder.defaultAbiCoder();
const ATTESTATION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
const STABLECOIN_DECIMALS = 6; // matches MockStablecoin (zUSD) and Hedera testnet USDC

/**
 * Conservative fallback HBAR/USD price used only when both oracle providers
 * are unreachable -- deliberately below current market rate (~$0.07 at time
 * of writing) so a pricing outage under-extends credit rather than over-extends it.
 */
const FALLBACK_HBAR_USD_PRICE = 0.03;

/** See CONTEXT.md -- computes limit/tenure, hashes the rationale, writes the attestation. */
export async function attest(
  businessId: string,
  intake: IntakeResult,
  review: ReviewResult,
  chain: ChainWriter,
): Promise<AttestResult> {
  const policy = TIER_POLICIES.find((t) => t.tier === review.riskTier) ?? TIER_POLICIES[TIER_POLICIES.length - 1]!;
  const monthlyTurnoverTinybars = intake.statement?.monthlyTurnoverTinybars ?? 0n;
  const hbarUsdPrice = intake.oracle?.price ?? FALLBACK_HBAR_USD_PRICE;

  // tinybars (8dp) -> HBAR -> USD (via oracle) -> stablecoin raw units (6dp)
  const monthlyTurnoverUsd = (Number(monthlyTurnoverTinybars) / 1e8) * hbarUsdPrice;
  const creditLimitUsd = monthlyTurnoverUsd * policy.riskMultiplier;
  const creditLimitStablecoinUnits = BigInt(Math.round(creditLimitUsd * 10 ** STABLECOIN_DECIMALS));
  const maxTenureMonths = policy.riskMultiplier > 0 ? Math.max(1, Math.round(policy.maxTenureDays / 30)) : 0;

  const rationaleHash = keccak256(toUtf8Bytes(review.rationale.join("\n")));

  const extra = abiCoder.encode(
    ["uint8", "uint16", "string", "uint256", "uint16"],
    [review.dcs, review.probabilityOfDefaultBps, review.riskTier, creditLimitStablecoinUnits, maxTenureMonths],
  );

  const expiresAt = Math.floor(Date.now() / 1000) + ATTESTATION_TTL_SECONDS;
  const receipt = await chain.attestDcs(businessId, rationaleHash, expiresAt, extra);

  return {
    ...review,
    businessId,
    creditLimitStablecoinUnits,
    maxTenureMonths,
    rationaleHash,
    onChain: receipt,
    oracle: intake.oracle,
  };
}
