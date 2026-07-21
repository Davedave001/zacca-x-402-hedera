/**
 * Zacca Stage 1 Dynamic Credit Score (DCS) engine — cold-start, rule-based.
 *
 * Implements the concept-paper methodology: cash-flow, stability,
 * customer-behaviour and operational features combine into a 0-100 DCS,
 * a risk tier, a probability-of-default estimate, and
 * `Credit Limit = Monthly Turnover x Risk Multiplier`.
 *
 * No historical default data is required — this is the rule-based fallback
 * used before enough loan-outcome data exists for Stage 2 (logistic
 * regression).
 *
 * PRODUCTION SWAP POINT: replace `syntheticFeaturesFor()` with a real lookup
 * against the Zacca VBR Data Rail (Chat-to-Credit pipeline output). Nothing
 * else needs to change.
 */

// ---------------------------------------------------------------------------
// Feature vector
// ---------------------------------------------------------------------------

export interface BusinessFeatures {
  businessId: string;

  // Cash-flow pillar
  /** Average monthly turnover in KES. */
  monthlyTurnoverKes: number;
  /** Month-over-month turnover growth rate, e.g. 0.05 = +5%. */
  turnoverGrowthRate: number;
  /** Coefficient of variation of daily inflows (lower = steadier). 0..1 */
  cashFlowVolatility: number;
  /** Average count of inflow transactions per day. */
  avgDailyTransactions: number;

  // Stability pillar
  /** Months since first recorded trading activity. */
  businessAgeMonths: number;
  /** Months at the current trading location. */
  locationStabilityMonths: number;
  /** Whether the business has a Verified Business Record. */
  vbrVerified: boolean;

  // Customer-behaviour pillar
  /** Share of transactions from repeat customers. 0..1 */
  repeatCustomerRate: number;
  /** Average transaction value in KES. */
  avgTransactionValueKes: number;
  /** Complaints per 100 transactions. */
  complaintRatePer100: number;

  // Operational pillar
  /** Share of supplier obligations paid on time. 0..1 */
  supplierPaymentTimeliness: number;
  /** Inventory turns per month (0 for service businesses). */
  inventoryTurnsPerMonth: number;
  /** Sector risk band: 0 = low-risk sector, 1 = medium, 2 = high. */
  sectorRiskBand: 0 | 1 | 2;
}

// ---------------------------------------------------------------------------
// Scoring result
// ---------------------------------------------------------------------------

export type RiskTier = "A" | "B" | "C" | "D" | "E";

export interface PillarScores {
  /** 0-100, weight 40% */
  cashFlow: number;
  /** 0-100, weight 25% */
  stability: number;
  /** 0-100, weight 20% */
  customerBehaviour: number;
  /** 0-100, weight 15% */
  operational: number;
}

export interface DcsResult {
  businessId: string;
  /** Dynamic Credit Score, integer 0-100. */
  dcs: number;
  riskTier: RiskTier;
  pillars: PillarScores;
  /** Estimated 12-month probability of default, 0..1. */
  probabilityOfDefault: number;
  /** Tier-driven multiplier applied to monthly turnover. */
  riskMultiplier: number;
  /** Recommended credit limit in KES = monthly turnover x risk multiplier. */
  recommendedCreditLimitKes: number;
  /** Maximum recommended loan tenure in days (0 = decline). */
  maxTenureDays: number;
  /** Methodology tag for downstream audit trails. */
  methodology: "zacca-dcs-stage1-rules-v1";
}

export const PILLAR_WEIGHTS = {
  cashFlow: 0.4,
  stability: 0.25,
  customerBehaviour: 0.2,
  operational: 0.15,
} as const;

interface TierPolicy {
  tier: RiskTier;
  minDcs: number;
  riskMultiplier: number;
  maxTenureDays: number;
}

/** Tier bands, checked top-down. */
export const TIER_POLICIES: readonly TierPolicy[] = [
  { tier: "A", minDcs: 80, riskMultiplier: 3.0, maxTenureDays: 90 },
  { tier: "B", minDcs: 65, riskMultiplier: 2.0, maxTenureDays: 60 },
  { tier: "C", minDcs: 50, riskMultiplier: 1.0, maxTenureDays: 45 },
  { tier: "D", minDcs: 35, riskMultiplier: 0.5, maxTenureDays: 30 },
  { tier: "E", minDcs: 0, riskMultiplier: 0, maxTenureDays: 0 },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function clamp100(x: number): number {
  return Math.min(100, Math.max(0, x));
}

/** Linear ramp: 0 at `lo`, 1 at `hi`, clamped. */
function ramp(x: number, lo: number, hi: number): number {
  if (hi === lo) return x >= hi ? 1 : 0;
  return clamp01((x - lo) / (hi - lo));
}

// ---------------------------------------------------------------------------
// Pillar scoring (each 0-100)
// ---------------------------------------------------------------------------

export function scoreCashFlow(f: BusinessFeatures): number {
  // Turnover level: KES 20k/month scores 0, KES 500k+ scores 1 (log ramp).
  const level = ramp(Math.log10(Math.max(f.monthlyTurnoverKes, 1)), Math.log10(20_000), Math.log10(500_000));
  // Growth: -20% -> 0, +15% -> 1.
  const growth = ramp(f.turnoverGrowthRate, -0.2, 0.15);
  // Steadiness: volatility 0.9 -> 0, 0.1 -> 1.
  const steadiness = 1 - ramp(f.cashFlowVolatility, 0.1, 0.9);
  // Activity: 2 tx/day -> 0, 40 tx/day -> 1.
  const activity = ramp(f.avgDailyTransactions, 2, 40);
  return clamp100(
    100 * (0.35 * level + 0.2 * growth + 0.3 * steadiness + 0.15 * activity),
  );
}

export function scoreStability(f: BusinessFeatures): number {
  // Age: 3 months -> 0, 36 months -> 1.
  const age = ramp(f.businessAgeMonths, 3, 36);
  // Location: 3 months -> 0, 24 months -> 1.
  const location = ramp(f.locationStabilityMonths, 3, 24);
  // VBR verification is a hard signal worth 30% of the pillar.
  const vbr = f.vbrVerified ? 1 : 0;
  return clamp100(100 * (0.4 * age + 0.3 * location + 0.3 * vbr));
}

export function scoreCustomerBehaviour(f: BusinessFeatures): number {
  // Repeat rate: 10% -> 0, 70% -> 1.
  const repeat = ramp(f.repeatCustomerRate, 0.1, 0.7);
  // Ticket size: KES 50 -> 0, KES 2000 -> 1 (log ramp).
  const ticket = ramp(Math.log10(Math.max(f.avgTransactionValueKes, 1)), Math.log10(50), Math.log10(2_000));
  // Complaints: 5 per 100 -> 0, 0 per 100 -> 1.
  const satisfaction = 1 - ramp(f.complaintRatePer100, 0, 5);
  return clamp100(100 * (0.5 * repeat + 0.2 * ticket + 0.3 * satisfaction));
}

export function scoreOperational(f: BusinessFeatures): number {
  // Supplier discipline dominates the pillar.
  const supplier = clamp01(f.supplierPaymentTimeliness);
  // Inventory turns: 0.5/month -> 0, 4/month -> 1.
  const inventory = ramp(f.inventoryTurnsPerMonth, 0.5, 4);
  // Sector risk: low = 1, medium = 0.5, high = 0.
  const sector = f.sectorRiskBand === 0 ? 1 : f.sectorRiskBand === 1 ? 0.5 : 0;
  return clamp100(100 * (0.5 * supplier + 0.25 * inventory + 0.25 * sector));
}

// ---------------------------------------------------------------------------
// Composite scoring
// ---------------------------------------------------------------------------

export function tierForDcs(dcs: number): TierPolicy {
  const policy = TIER_POLICIES.find((t) => dcs >= t.minDcs);
  // TIER_POLICIES ends at minDcs 0, so this only guards against NaN.
  if (!policy) return TIER_POLICIES[TIER_POLICIES.length - 1]!;
  return policy;
}

/**
 * Estimated 12-month probability of default from the DCS.
 * Monotone decreasing: DCS 100 -> ~0.9%, DCS 50 -> ~6.8%, DCS 0 -> 50%.
 */
export function probabilityOfDefault(dcs: number): number {
  return Number((0.5 * Math.exp(-dcs / 25)).toFixed(4));
}

export function computeDcs(features: BusinessFeatures): DcsResult {
  const pillars: PillarScores = {
    cashFlow: Math.round(scoreCashFlow(features)),
    stability: Math.round(scoreStability(features)),
    customerBehaviour: Math.round(scoreCustomerBehaviour(features)),
    operational: Math.round(scoreOperational(features)),
  };

  const dcs = Math.round(
    clamp100(
      pillars.cashFlow * PILLAR_WEIGHTS.cashFlow +
        pillars.stability * PILLAR_WEIGHTS.stability +
        pillars.customerBehaviour * PILLAR_WEIGHTS.customerBehaviour +
        pillars.operational * PILLAR_WEIGHTS.operational,
    ),
  );

  const policy = tierForDcs(dcs);
  const recommendedCreditLimitKes = Math.round(
    features.monthlyTurnoverKes * policy.riskMultiplier,
  );

  return {
    businessId: features.businessId,
    dcs,
    riskTier: policy.tier,
    pillars,
    probabilityOfDefault: probabilityOfDefault(dcs),
    riskMultiplier: policy.riskMultiplier,
    recommendedCreditLimitKes,
    maxTenureDays: policy.maxTenureDays,
    methodology: "zacca-dcs-stage1-rules-v1",
  };
}

// ---------------------------------------------------------------------------
// Synthetic feature derivation (demo only)
// ---------------------------------------------------------------------------

/** FNV-1a 32-bit hash of a string — stable seed source. */
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 — small deterministic PRNG. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Deterministically derive a plausible feature vector from a businessId.
 * Same seeded-PRNG technique as the reference MockDataProvider, so the
 * provider is self-contained and reproducible without a live data pipeline.
 */
export function syntheticFeaturesFor(businessId: string): BusinessFeatures {
  const rand = mulberry32(fnv1a(businessId));

  const monthlyTurnoverKes = Math.round(15_000 + rand() * 785_000);
  const sectorRoll = rand();

  return {
    businessId,
    monthlyTurnoverKes,
    turnoverGrowthRate: Number((-0.25 + rand() * 0.5).toFixed(4)),
    cashFlowVolatility: Number((0.05 + rand() * 0.9).toFixed(4)),
    avgDailyTransactions: Math.round(1 + rand() * 59),
    businessAgeMonths: Math.round(1 + rand() * 119),
    locationStabilityMonths: Math.round(1 + rand() * 59),
    vbrVerified: rand() < 0.6,
    repeatCustomerRate: Number((rand() * 0.9).toFixed(4)),
    avgTransactionValueKes: Math.round(30 + rand() * 4_970),
    complaintRatePer100: Number((rand() * 8).toFixed(2)),
    supplierPaymentTimeliness: Number((0.2 + rand() * 0.8).toFixed(4)),
    inventoryTurnsPerMonth: Number((rand() * 6).toFixed(2)),
    sectorRiskBand: sectorRoll < 0.5 ? 0 : sectorRoll < 0.85 ? 1 : 2,
  };
}
