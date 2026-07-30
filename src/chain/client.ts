import { AbiCoder, Contract, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes } from "ethers";
import type { AttestationView, ChainReader, ChainWriter } from "../core/icm/types.js";
import { ATTESTATION_REGISTRY_ABI, CREDIT_LINE_ABI, MOCK_STABLECOIN_ABI } from "./abis.js";
import { loadDeployment } from "./deployment.js";

const abiCoder = AbiCoder.defaultAbiCoder();
const VBR_INPUT_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days, matches seed-demo-business.ts

const RPC_URL = process.env.HEDERA_JSON_RPC_URL ?? "https://testnet.hashio.io/api";

let _provider: JsonRpcProvider | null = null;
function provider(): JsonRpcProvider {
  if (!_provider) _provider = new JsonRpcProvider(RPC_URL);
  return _provider;
}

let _attestor: Wallet | null = null;
function attestorSigner(): Wallet {
  if (!_attestor) {
    const key = process.env.HEDERA_TESTNET_DEPLOYER_KEY;
    if (!key) {
      throw new Error(
        "HEDERA_TESTNET_DEPLOYER_KEY not set -- needed to write DCS attestations (this is Zacca's own backend acting as attestor, per implementation plan §6.5's Stage 2 halfway state).",
      );
    }
    _attestor = new Wallet(key, provider());
  }
  return _attestor;
}

function attestationRegistry(address: string, withSigner: boolean): Contract {
  return new Contract(address, ATTESTATION_REGISTRY_ABI, withSigner ? attestorSigner() : provider());
}

async function readAttestation(registryAddress: string, businessId: string): Promise<AttestationView | null> {
  const registry = attestationRegistry(registryAddress, false);
  const valid: boolean = await registry.getFunction("isValid")(businessId);
  if (!valid) return null;
  const a = await registry.getFunction("read")(businessId);
  return {
    claimHash: a.claimHash,
    issuedAt: Number(a.issuedAt),
    expiresAt: Number(a.expiresAt),
    attestor: a.attestor,
    revoked: a.revoked,
    extra: a.extra,
  };
}

/** ChainReader/ChainWriter implementation backing the ICM pipeline (src/core/icm). */
export class HederaContractChainClient implements ChainReader, ChainWriter {
  private readonly deployment = loadDeployment();

  async readVbrAttestation(businessId: string): Promise<AttestationView | null> {
    return readAttestation(this.deployment.contracts.VBRRegistry, businessId);
  }

  async readStatementAttestation(businessId: string): Promise<AttestationView | null> {
    return readAttestation(this.deployment.contracts.StatementRegistry, businessId);
  }

  async attestDcs(
    businessId: string,
    claimHash: string,
    expiresAtUnixSeconds: number,
    extra: string,
  ): Promise<{ transactionHash: string }> {
    const registry = attestationRegistry(this.deployment.contracts.DCSRegistry, true);
    const tx = await registry.getFunction("attest")(businessId, claimHash, expiresAtUnixSeconds, extra);
    const receipt = await tx.wait();
    return { transactionHash: receipt.hash };
  }

  /**
   * Reads the on-chain CreditLine decision -- computed by the contract, not
   * re-derived here. `stablecoin` selects which deployed CreditLine instance
   * to read (both share the same DCSRegistry, so the limit itself is
   * identical either way -- this selects which contract a wallet would
   * actually draw() from). "usdc" falls back to null if that instance
   * hasn't been deployed yet (see contracts/scripts/deploy-usdc-creditline.ts).
   */
  async readCreditLine(
    businessId: string,
    stablecoin: "zusd" | "usdc" = "zusd",
  ): Promise<{ limitStablecoinUnits: bigint; maxTenureMonths: number; contractAddress: string; stablecoin: string } | null> {
    const contractAddress = stablecoin === "usdc" ? this.deployment.contracts.CreditLineUsdc : this.deployment.contracts.CreditLine;
    if (!contractAddress) return null;
    const creditLine = new Contract(contractAddress, CREDIT_LINE_ABI, provider());
    try {
      const [limitStablecoinUnits, maxTenureMonths] = await creditLine.getFunction("creditLimit")(businessId);
      return {
        limitStablecoinUnits: BigInt(limitStablecoinUnits),
        maxTenureMonths: Number(maxTenureMonths),
        contractAddress,
        stablecoin: stablecoin === "usdc" ? "USDC" : "zUSD",
      };
    } catch {
      return null; // no valid DCS attestation yet
    }
  }

  async stablecoinSymbol(): Promise<string> {
    const stablecoin = new Contract(this.deployment.contracts.MockStablecoin, MOCK_STABLECOIN_ABI, provider());
    return stablecoin.getFunction("symbol")();
  }

  /**
   * Writes a user-submitted VBR claim to VBRRegistry, attested by Zacca's
   * backend (same attestor key as attestDcs -- Stage 2 trust model, plan
   * §6.5: the backend attests, the wallet doesn't self-attest, since an
   * unreviewed self-attestation isn't "verified" evidence). The claim's
   * business fields are stored directly on-chain in `extra` (not just a
   * hash), and `claimHash` covers the full submitted payload including a
   * timestamp, for audit purposes.
   */
  async writeVbrClaim(
    businessId: string,
    businessName: string,
    yearsInBusiness: number,
    sector: string,
  ): Promise<{ transactionHash: string }> {
    const submittedAt = Math.floor(Date.now() / 1000);
    const claimHash = keccak256(
      toUtf8Bytes(JSON.stringify({ businessId, businessName, yearsInBusiness, sector, submittedAt })),
    );
    const extra = abiCoder.encode(["string", "uint16", "string"], [businessName, yearsInBusiness, sector]);
    const expiresAt = submittedAt + VBR_INPUT_TTL_SECONDS;

    const registry = attestationRegistry(this.deployment.contracts.VBRRegistry, true);
    const tx = await registry.getFunction("attest")(businessId, claimHash, expiresAt, extra);
    const receipt = await tx.wait();
    return { transactionHash: receipt.hash };
  }
}
