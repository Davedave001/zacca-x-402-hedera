/**
 * CreditScoreProvider — Zacca's Credit Intelligence API as an x402 DataProvider.
 *
 * Three paid products, all keyed by `businessId`:
 *   vbr-lookup   0.01 HBAR  Verified Business Record check
 *   dcs-score    0.02 HBAR  Dynamic Credit Score + risk tier
 *   credit-limit 0.05 HBAR  full assessment (DCS, PD, credit limit, tenure)
 */
import {
  computeDcs,
  syntheticFeaturesFor,
} from "../../core/dcs-scoring.js";
import {
  type DataProvider,
  type ProductSpec,
  requireParams,
  requireProduct,
} from "../../core/provider.js";

const PRODUCTS: readonly ProductSpec[] = [
  {
    id: "vbr-lookup",
    description:
      "Whether the business has a Verified Business Record (VBR) on the Zacca data rail",
    params: ["businessId"],
    priceTinybars: "1000000",
    priceHbar: "0.01",
  },
  {
    id: "dcs-score",
    description: "Dynamic Credit Score (0-100) and risk tier",
    params: ["businessId"],
    priceTinybars: "2000000",
    priceHbar: "0.02",
  },
  {
    id: "credit-limit",
    description:
      "Full assessment: DCS, probability of default, recommended credit limit, max tenure",
    params: ["businessId"],
    priceTinybars: "5000000",
    priceHbar: "0.05",
  },
];

export class CreditScoreProvider implements DataProvider {
  readonly name = "zacca-credit";
  readonly products = PRODUCTS;

  async fetch(
    productId: string,
    params: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const product = requireProduct(this, productId);
    requireParams(product, params);

    const businessId = params["businessId"]!;
    const features = syntheticFeaturesFor(businessId);
    const result = computeDcs(features);
    const generatedAt = new Date().toISOString();

    switch (productId) {
      case "vbr-lookup":
        return {
          product: productId,
          businessId,
          vbrVerified: features.vbrVerified,
          generatedAt,
        };
      case "dcs-score":
        return {
          product: productId,
          businessId,
          dcs: result.dcs,
          riskTier: result.riskTier,
          methodology: result.methodology,
          generatedAt,
        };
      case "credit-limit":
        return {
          product: productId,
          businessId,
          dcs: result.dcs,
          riskTier: result.riskTier,
          pillars: result.pillars,
          probabilityOfDefault: result.probabilityOfDefault,
          riskMultiplier: result.riskMultiplier,
          monthlyTurnoverKes: features.monthlyTurnoverKes,
          recommendedCreditLimitKes: result.recommendedCreditLimitKes,
          maxTenureDays: result.maxTenureDays,
          vbrVerified: features.vbrVerified,
          methodology: result.methodology,
          generatedAt,
        };
      default:
        // requireProduct already threw for unknown ids.
        throw new Error(`Unhandled product: ${productId}`);
    }
  }
}
