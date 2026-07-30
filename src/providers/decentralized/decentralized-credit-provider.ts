/**
 * DecentralizedCreditProvider — Zacca's Credit Intelligence API backed by
 * the on-chain VBR/Statement/DCS registries and CreditLine contract
 * (implementation plan §6), with DCS scoring run through the ICM-structured
 * reasoning pipeline (§6.3, src/core/icm/) instead of the in-process Stage 1
 * formula. This is the actual bounty submission's scoring path -- see
 * CreditScoreProvider (src/providers/credit/) for the Stage 1 predecessor,
 * kept for comparison.
 *
 * Same three x402-priced products as Stage 1 -- endpoint shapes are stable
 * across the roadmap (implementation plan §3) -- but what backs each one is
 * now a contract read/write, not in-process compute.
 */
import { AbiCoder } from "ethers";
import { StubReasoningClient, runIcmPipeline } from "../../core/icm/pipeline.js";
import { HederaContractChainClient } from "../../chain/client.js";
import { getOracleProvider, type OracleId } from "../../chain/oracles.js";
import {
  type DataProvider,
  type ProductSpec,
  requireParams,
  requireProduct,
} from "../../core/provider.js";

const abiCoder = AbiCoder.defaultAbiCoder();

/** Decodes the (businessName, yearsInBusiness, sector) shape written by writeVbrClaim -- older seeded attestations have extra="0x" and decode to null. */
function decodeVbrClaim(extra: string): { businessName: string; yearsInBusiness: number; sector: string } | null {
  if (extra === "0x") return null;
  try {
    const [businessName, yearsInBusiness, sector] = abiCoder.decode(["string", "uint16", "string"], extra);
    return { businessName, yearsInBusiness: Number(yearsInBusiness), sector };
  } catch {
    return null;
  }
}

function resolveOracleId(params: Record<string, string>): OracleId {
  return params["oracle"] === "supra" ? "supra" : "pyth";
}

function resolveStablecoin(params: Record<string, string>): "zusd" | "usdc" {
  return params["stablecoin"] === "usdc" ? "usdc" : "zusd";
}

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
    description:
      "Dynamic Credit Score (0-100) and risk tier. Optional ?oracle=pyth|supra (default pyth) selects the live HBAR/USD price oracle used in reasoning.",
    params: ["businessId"],
    priceTinybars: "2000000",
    priceHbar: "0.02",
  },
  {
    id: "credit-limit",
    description:
      "Full assessment: DCS, probability of default, recommended credit limit, max tenure. Optional ?oracle=pyth|supra (default pyth) selects the live HBAR/USD price oracle used for the credit-limit FX conversion; optional ?stablecoin=zusd|usdc (default zusd) selects which CreditLine instance/disbursement asset to report.",
    params: ["businessId"],
    priceTinybars: "5000000",
    priceHbar: "0.05",
  },
];

export class DecentralizedCreditProvider implements DataProvider {
  readonly name = "zacca-decentralized";
  readonly products = PRODUCTS;
  private readonly chain = new HederaContractChainClient();
  private readonly reasoningClient = new StubReasoningClient();

  async fetch(
    productId: string,
    params: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const product = requireProduct(this, productId);
    requireParams(product, params);

    const businessId = params["businessId"]!;
    const generatedAt = new Date().toISOString();

    switch (productId) {
      case "vbr-lookup": {
        const vbr = await this.chain.readVbrAttestation(businessId);
        return {
          product: productId,
          businessId,
          vbrVerified: vbr !== null,
          attestation:
            vbr === null
              ? null
              : {
                  claimHash: vbr.claimHash,
                  issuedAt: vbr.issuedAt,
                  expiresAt: vbr.expiresAt,
                  attestor: vbr.attestor,
                  claim: decodeVbrClaim(vbr.extra),
                },
          methodology: "zacca-vbr-registry-onchain-v1",
          generatedAt,
        };
      }

      case "dcs-score": {
        const oracleId = resolveOracleId(params);
        const result = await runIcmPipeline({
          businessId,
          chainReader: this.chain,
          chainWriter: this.chain,
          reasoningClient: this.reasoningClient,
          oracleReader: getOracleProvider(oracleId),
        });
        return {
          product: productId,
          businessId,
          dcs: result.dcs,
          riskTier: result.riskTier,
          rationale: result.rationale,
          rationaleHash: result.rationaleHash,
          oracle: result.oracle,
          onChain: result.onChain,
          methodology: "zacca-dcs-icm-stage2-v1",
          generatedAt,
        };
      }

      case "credit-limit": {
        const oracleId = resolveOracleId(params);
        const result = await runIcmPipeline({
          businessId,
          chainReader: this.chain,
          chainWriter: this.chain,
          reasoningClient: this.reasoningClient,
          oracleReader: getOracleProvider(oracleId),
        });
        const stablecoin = resolveStablecoin(params);
        const onChainLimit = await this.chain.readCreditLine(businessId, stablecoin);
        return {
          product: productId,
          businessId,
          dcs: result.dcs,
          riskTier: result.riskTier,
          probabilityOfDefault: result.probabilityOfDefaultBps / 10_000,
          recommendedCreditLimitStablecoinUnits: result.creditLimitStablecoinUnits.toString(),
          maxTenureMonths: result.maxTenureMonths,
          onChainCreditLine: onChainLimit
            ? {
                limitStablecoinUnits: onChainLimit.limitStablecoinUnits.toString(),
                maxTenureMonths: onChainLimit.maxTenureMonths,
                contractAddress: onChainLimit.contractAddress,
                stablecoin: onChainLimit.stablecoin,
              }
            : stablecoin === "usdc"
              ? { note: "USDC-backed CreditLine not usable yet -- unfunded, see DEPLOY.md" }
              : null,
          oracle: result.oracle,
          rationaleHash: result.rationaleHash,
          onChain: result.onChain,
          methodology: "zacca-dcs-icm-stage2-v1",
          generatedAt,
        };
      }

      default:
        // requireProduct already threw for unknown ids.
        throw new Error(`Unhandled product: ${productId}`);
    }
  }
}
