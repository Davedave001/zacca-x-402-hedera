/**
 * Deploys LendingAdapter -- the protocol-agnostic credit-oracle view
 * interface (implementation plan §12.5) -- against the existing
 * DCSRegistry. Any lending protocol can call getLoanTerms(businessId) on
 * this contract directly, without payment or permission.
 */
import { network } from "hardhat";
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const { ethers } = await network.connect("hederaTestnet");
  const [deployer] = await ethers.getSigners();

  const deploymentPath = path.join(__dirname, "..", "deployments", "hederaTestnet.json");
  const deployment = JSON.parse(readFileSync(deploymentPath, "utf-8"));

  console.log("Deploying LendingAdapter as:", deployer.address);
  const adapter = await ethers.deployContract("LendingAdapter", [deployment.contracts.DCSRegistry]);
  await adapter.waitForDeployment();
  const address = await adapter.getAddress();
  console.log("LendingAdapter:", address);

  deployment.contracts.LendingAdapter = address;
  writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2) + "\n");
  console.log("\nUpdated", deploymentPath);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
