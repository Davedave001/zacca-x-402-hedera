/**
 * Seeds on-chain VBR + Statement attestations for the demo business
 * (biz-alice-mboga), and links its CreditLine wallet, so the live
 * vbr-lookup/dcs-score/credit-limit endpoints have real evidence to read
 * instead of hitting "no attestation" for a brand-new registry.
 *
 * This is Zacca's own backend acting as attestor -- implementation plan
 * §6.5's Stage 2 halfway state, not a multi-bureau attestor quorum.
 */
import "dotenv/config";
import { AbiCoder, Contract, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes } from "ethers";
import { ATTESTATION_REGISTRY_ABI } from "../src/chain/abis.js";
import { loadDeployment } from "../src/chain/deployment.js";

const BUSINESS_ID = process.env.E2E_SYMBOL ?? "biz-alice-mboga";
const NINETY_DAYS = 90 * 24 * 60 * 60;
const CREDIT_LINE_ABI = [
  "function linkWallet(string businessId, address wallet) external",
  "function businessWallet(string businessId) external view returns (address)",
];

async function main() {
  const key = process.env.HEDERA_TESTNET_DEPLOYER_KEY;
  if (!key) throw new Error("HEDERA_TESTNET_DEPLOYER_KEY not set in .env");

  const provider = new JsonRpcProvider(process.env.HEDERA_JSON_RPC_URL ?? "https://testnet.hashio.io/api");
  const signer = new Wallet(key, provider);
  const deployment = loadDeployment();
  const abiCoder = AbiCoder.defaultAbiCoder();
  const expiresAt = Math.floor(Date.now() / 1000) + NINETY_DAYS;

  console.log(`Seeding "${BUSINESS_ID}" as ${signer.address} ...`);

  const vbrRegistry = new Contract(deployment.contracts.VBRRegistry, ATTESTATION_REGISTRY_ABI, signer);
  const vbrClaimHash = keccak256(toUtf8Bytes(`vbr:${BUSINESS_ID}:verified`));
  const vbrTx = await vbrRegistry.getFunction("attest")(BUSINESS_ID, vbrClaimHash, expiresAt, "0x");
  await vbrTx.wait();
  console.log("VBRRegistry.attest tx:", vbrTx.hash);

  const statementRegistry = new Contract(deployment.contracts.StatementRegistry, ATTESTATION_REGISTRY_ABI, signer);
  const monthlyTurnoverTinybars = 8_000_000_000n; // 80 HBAR/month-equivalent
  const periodStart = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;
  const periodEnd = Math.floor(Date.now() / 1000);
  const statementExtra = abiCoder.encode(
    ["uint64", "uint64", "uint256"],
    [periodStart, periodEnd, monthlyTurnoverTinybars],
  );
  const statementClaimHash = keccak256(toUtf8Bytes(`statement:${BUSINESS_ID}:${periodStart}:${periodEnd}`));
  const statementTx = await statementRegistry.getFunction("attest")(
    BUSINESS_ID,
    statementClaimHash,
    expiresAt,
    statementExtra,
  );
  await statementTx.wait();
  console.log("StatementRegistry.attest tx:", statementTx.hash);
  console.log("  monthly turnover:", monthlyTurnoverTinybars.toString(), "tinybars");

  const creditLine = new Contract(deployment.contracts.CreditLine, CREDIT_LINE_ABI, signer);
  const existingWallet: string = await creditLine.getFunction("businessWallet")(BUSINESS_ID);
  if (existingWallet === "0x0000000000000000000000000000000000000000") {
    const linkTx = await creditLine.getFunction("linkWallet")(BUSINESS_ID, signer.address);
    await linkTx.wait();
    console.log("CreditLine.linkWallet tx:", linkTx.hash, "-> wallet", signer.address);
  } else {
    console.log("CreditLine wallet already linked:", existingWallet);
  }

  console.log("\nSeed complete for", BUSINESS_ID);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
