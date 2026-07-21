import { Contract, JsonRpcProvider, Wallet } from "ethers";
import type { AttestationView, ChainReader, ChainWriter } from "../core/icm/types.js";
import { ATTESTATION_REGISTRY_ABI, CREDIT_LINE_ABI, MOCK_STABLECOIN_ABI } from "./abis.js";
import { loadDeployment } from "./deployment.js";

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

  /** Reads the on-chain CreditLine decision -- computed by the contract, not re-derived here. */
  async readCreditLine(businessId: string): Promise<{ limitTinybars: bigint; maxTenureMonths: number } | null> {
    const creditLine = new Contract(this.deployment.contracts.CreditLine, CREDIT_LINE_ABI, provider());
    try {
      const [limitTinybars, maxTenureMonths] = await creditLine.getFunction("creditLimit")(businessId);
      return { limitTinybars: BigInt(limitTinybars), maxTenureMonths: Number(maxTenureMonths) };
    } catch {
      return null; // no valid DCS attestation yet
    }
  }

  async stablecoinSymbol(): Promise<string> {
    const stablecoin = new Contract(this.deployment.contracts.MockStablecoin, MOCK_STABLECOIN_ABI, provider());
    return stablecoin.getFunction("symbol")();
  }
}
