import { describe, expect, it } from "vitest";

import {
  type BusinessFeatures,
  PILLAR_WEIGHTS,
  TIER_POLICIES,
  computeDcs,
  probabilityOfDefault,
  scoreCashFlow,
  scoreCustomerBehaviour,
  scoreOperational,
  scoreStability,
  syntheticFeaturesFor,
  tierForDcs,
} from "../src/core/dcs-scoring.js";

const SAMPLE_IDS = Array.from({ length: 200 }, (_, i) => `biz-${i}-sample`);

function baseFeatures(overrides: Partial<BusinessFeatures> = {}): BusinessFeatures {
  return {
    businessId: "biz-test",
    monthlyTurnoverKes: 200_000,
    turnoverGrowthRate: 0.05,
    cashFlowVolatility: 0.3,
    avgDailyTransactions: 20,
    businessAgeMonths: 24,
    locationStabilityMonths: 18,
    vbrVerified: true,
    repeatCustomerRate: 0.5,
    avgTransactionValueKes: 500,
    complaintRatePer100: 1,
    supplierPaymentTimeliness: 0.9,
    inventoryTurnsPerMonth: 2,
    sectorRiskBand: 0,
    ...overrides,
  };
}

describe("syntheticFeaturesFor", () => {
  it("is deterministic for the same businessId", () => {
    expect(syntheticFeaturesFor("biz-alice-mboga")).toEqual(
      syntheticFeaturesFor("biz-alice-mboga"),
    );
  });

  it("differs across businessIds", () => {
    const a = syntheticFeaturesFor("biz-alice-mboga");
    const b = syntheticFeaturesFor("biz-bob-duka");
    expect(a).not.toEqual(b);
  });

  it("stays within documented ranges for many ids", () => {
    for (const id of SAMPLE_IDS) {
      const f = syntheticFeaturesFor(id);
      expect(f.monthlyTurnoverKes).toBeGreaterThanOrEqual(15_000);
      expect(f.monthlyTurnoverKes).toBeLessThanOrEqual(800_000);
      expect(f.cashFlowVolatility).toBeGreaterThanOrEqual(0);
      expect(f.cashFlowVolatility).toBeLessThanOrEqual(1);
      expect(f.repeatCustomerRate).toBeGreaterThanOrEqual(0);
      expect(f.repeatCustomerRate).toBeLessThanOrEqual(1);
      expect(f.supplierPaymentTimeliness).toBeGreaterThanOrEqual(0);
      expect(f.supplierPaymentTimeliness).toBeLessThanOrEqual(1);
      expect([0, 1, 2]).toContain(f.sectorRiskBand);
    }
  });

  it("echoes the businessId into the feature vector", () => {
    expect(syntheticFeaturesFor("biz-x").businessId).toBe("biz-x");
  });
});

describe("pillar scores", () => {
  it("are each within 0-100 for many ids", () => {
    for (const id of SAMPLE_IDS) {
      const f = syntheticFeaturesFor(id);
      for (const score of [
        scoreCashFlow(f),
        scoreStability(f),
        scoreCustomerBehaviour(f),
        scoreOperational(f),
      ]) {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    }
  });

  it("rewards VBR verification in the stability pillar", () => {
    const verified = scoreStability(baseFeatures({ vbrVerified: true }));
    const unverified = scoreStability(baseFeatures({ vbrVerified: false }));
    expect(verified).toBeGreaterThan(unverified);
  });

  it("penalizes cash-flow volatility", () => {
    const steady = scoreCashFlow(baseFeatures({ cashFlowVolatility: 0.1 }));
    const choppy = scoreCashFlow(baseFeatures({ cashFlowVolatility: 0.9 }));
    expect(steady).toBeGreaterThan(choppy);
  });

  it("penalizes complaints in the customer pillar", () => {
    const clean = scoreCustomerBehaviour(baseFeatures({ complaintRatePer100: 0 }));
    const noisy = scoreCustomerBehaviour(baseFeatures({ complaintRatePer100: 6 }));
    expect(clean).toBeGreaterThan(noisy);
  });

  it("penalizes high-risk sectors in the operational pillar", () => {
    const low = scoreOperational(baseFeatures({ sectorRiskBand: 0 }));
    const high = scoreOperational(baseFeatures({ sectorRiskBand: 2 }));
    expect(low).toBeGreaterThan(high);
  });
});

describe("computeDcs", () => {
  it("is deterministic", () => {
    const f = syntheticFeaturesFor("biz-alice-mboga");
    expect(computeDcs(f)).toEqual(computeDcs(f));
  });

  it("produces an integer DCS within 0-100 for many ids", () => {
    for (const id of SAMPLE_IDS) {
      const r = computeDcs(syntheticFeaturesFor(id));
      expect(Number.isInteger(r.dcs)).toBe(true);
      expect(r.dcs).toBeGreaterThanOrEqual(0);
      expect(r.dcs).toBeLessThanOrEqual(100);
    }
  });

  it("uses pillar weights that sum to 1", () => {
    const total =
      PILLAR_WEIGHTS.cashFlow +
      PILLAR_WEIGHTS.stability +
      PILLAR_WEIGHTS.customerBehaviour +
      PILLAR_WEIGHTS.operational;
    expect(total).toBeCloseTo(1, 10);
  });

  it("computes credit limit as turnover x risk multiplier", () => {
    for (const id of SAMPLE_IDS.slice(0, 50)) {
      const f = syntheticFeaturesFor(id);
      const r = computeDcs(f);
      expect(r.recommendedCreditLimitKes).toBe(
        Math.round(f.monthlyTurnoverKes * r.riskMultiplier),
      );
    }
  });

  it("scores strong businesses into upper tiers", () => {
    const r = computeDcs(
      baseFeatures({
        monthlyTurnoverKes: 600_000,
        turnoverGrowthRate: 0.2,
        cashFlowVolatility: 0.08,
        avgDailyTransactions: 45,
        businessAgeMonths: 48,
        locationStabilityMonths: 36,
        vbrVerified: true,
        repeatCustomerRate: 0.8,
        avgTransactionValueKes: 2_500,
        complaintRatePer100: 0,
        supplierPaymentTimeliness: 1,
        inventoryTurnsPerMonth: 5,
        sectorRiskBand: 0,
      }),
    );
    expect(r.dcs).toBeGreaterThanOrEqual(80);
    expect(r.riskTier).toBe("A");
    expect(r.maxTenureDays).toBe(90);
  });

  it("declines very weak businesses (tier E, zero limit)", () => {
    const r = computeDcs(
      baseFeatures({
        monthlyTurnoverKes: 16_000,
        turnoverGrowthRate: -0.25,
        cashFlowVolatility: 0.95,
        avgDailyTransactions: 1,
        businessAgeMonths: 2,
        locationStabilityMonths: 1,
        vbrVerified: false,
        repeatCustomerRate: 0.05,
        avgTransactionValueKes: 40,
        complaintRatePer100: 8,
        supplierPaymentTimeliness: 0.2,
        inventoryTurnsPerMonth: 0.1,
        sectorRiskBand: 2,
      }),
    );
    expect(r.riskTier).toBe("E");
    expect(r.riskMultiplier).toBe(0);
    expect(r.recommendedCreditLimitKes).toBe(0);
    expect(r.maxTenureDays).toBe(0);
  });

  it("tags results with the Stage 1 methodology", () => {
    const r = computeDcs(syntheticFeaturesFor("biz-any"));
    expect(r.methodology).toBe("zacca-dcs-stage1-rules-v1");
  });
});

describe("tierForDcs", () => {
  it("maps band boundaries to the documented tiers", () => {
    expect(tierForDcs(100).tier).toBe("A");
    expect(tierForDcs(80).tier).toBe("A");
    expect(tierForDcs(79).tier).toBe("B");
    expect(tierForDcs(65).tier).toBe("B");
    expect(tierForDcs(64).tier).toBe("C");
    expect(tierForDcs(50).tier).toBe("C");
    expect(tierForDcs(49).tier).toBe("D");
    expect(tierForDcs(35).tier).toBe("D");
    expect(tierForDcs(34).tier).toBe("E");
    expect(tierForDcs(0).tier).toBe("E");
  });

  it("has monotonically decreasing multipliers and tenures", () => {
    for (let i = 1; i < TIER_POLICIES.length; i++) {
      expect(TIER_POLICIES[i]!.riskMultiplier).toBeLessThan(
        TIER_POLICIES[i - 1]!.riskMultiplier,
      );
      expect(TIER_POLICIES[i]!.maxTenureDays).toBeLessThan(
        TIER_POLICIES[i - 1]!.maxTenureDays,
      );
    }
  });
});

describe("probabilityOfDefault", () => {
  it("decreases monotonically as DCS rises", () => {
    let prev = Infinity;
    for (let dcs = 0; dcs <= 100; dcs += 5) {
      const pd = probabilityOfDefault(dcs);
      expect(pd).toBeLessThanOrEqual(prev);
      prev = pd;
    }
  });

  it("stays within sensible bounds", () => {
    expect(probabilityOfDefault(0)).toBe(0.5);
    expect(probabilityOfDefault(100)).toBeLessThan(0.02);
    expect(probabilityOfDefault(100)).toBeGreaterThan(0);
  });
});
