/**
 * Deploys a second CreditLine instance backed by real Hedera testnet USDC
 * (Circle-issued HTS token 0.0.429274, EVM long-zero address
 * 0x0000000000000000000000000000000000068cda) instead of the zUSD
 * MockStablecoin -- reuses the existing DCSRegistry, so both CreditLine
 * instances read the same attestations. See DEPLOY.md / IMPLEMENTATION_PLAN.md
 * for the funding caveat: this pool starts EMPTY. Hedera requires an
 * explicit token association before any account (including a contract) can
 * hold an HTS token, and Circle's testnet USDC faucet (faucet.circle.com) is
 * a browser-only UI -- neither step could be completed non-interactively,
 * so `draw()` against this CreditLine will revert until both are done by hand.
 */
import { network } from "hardhat";
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USDC_EVM_ADDRESS = "0x0000000000000000000000000000000000068cda";

async function main() {
  const { ethers } = await network.connect("hederaTestnet");
  const [deployer] = await ethers.getSigners();

  const deploymentPath = path.join(__dirname, "..", "deployments", "hederaTestnet.json");
  const deployment = JSON.parse(readFileSync(deploymentPath, "utf-8"));

  console.log("Deploying USDC-backed CreditLine as:", deployer.address);
  const creditLineUsdc = await ethers.deployContract("CreditLine", [
    deployment.contracts.DCSRegistry,
    USDC_EVM_ADDRESS,
  ]);
  await creditLineUsdc.waitForDeployment();
  const address = await creditLineUsdc.getAddress();
  console.log("CreditLine (USDC):", address);

  deployment.contracts.CreditLineUsdc = address;
  deployment.contracts.UsdcToken = USDC_EVM_ADDRESS;
  writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2) + "\n");
  console.log("\nUpdated", deploymentPath);
  console.log(
    "\nNOTE: this pool is UNFUNDED -- needs (1) a token association for the",
    "contract's account and (2) real testnet USDC sent to it. Both steps",
    "need a browser (Hedera doesn't allow signing an association for an",
    "account you don't control, and Circle's faucet has no API). See DEPLOY.md.",
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
