import { network } from "hardhat";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const { ethers } = await network.connect("hederaTestnet");
  const [deployer] = await ethers.getSigners();
  console.log("Deploying as:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "HBAR-equivalent");

  const vbrRegistry = await ethers.deployContract("VBRRegistry");
  await vbrRegistry.waitForDeployment();
  console.log("VBRRegistry:", await vbrRegistry.getAddress());

  const statementRegistry = await ethers.deployContract("StatementRegistry");
  await statementRegistry.waitForDeployment();
  console.log("StatementRegistry:", await statementRegistry.getAddress());

  const dcsRegistry = await ethers.deployContract("DCSRegistry");
  await dcsRegistry.waitForDeployment();
  console.log("DCSRegistry:", await dcsRegistry.getAddress());

  const stablecoin = await ethers.deployContract("MockStablecoin");
  await stablecoin.waitForDeployment();
  console.log("MockStablecoin (zUSD):", await stablecoin.getAddress());

  const creditLine = await ethers.deployContract("CreditLine", [
    await dcsRegistry.getAddress(),
    await stablecoin.getAddress(),
  ]);
  await creditLine.waitForDeployment();
  console.log("CreditLine:", await creditLine.getAddress());

  // Seed the CreditLine contract as the lending pool: 1,000,000 zUSD.
  const poolAmount = ethers.parseUnits("1000000", 6);
  const mintTx = await stablecoin.mint(await creditLine.getAddress(), poolAmount);
  await mintTx.wait();
  console.log("Minted lending pool:", ethers.formatUnits(poolAmount, 6), "zUSD -> CreditLine");

  const deployment = {
    network: "hederaTestnet",
    chainId: 296,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    contracts: {
      VBRRegistry: await vbrRegistry.getAddress(),
      StatementRegistry: await statementRegistry.getAddress(),
      DCSRegistry: await dcsRegistry.getAddress(),
      MockStablecoin: await stablecoin.getAddress(),
      CreditLine: await creditLine.getAddress(),
    },
  };

  const outPath = path.join(__dirname, "..", "deployments", "hederaTestnet.json");
  writeFileSync(outPath, JSON.stringify(deployment, null, 2) + "\n");
  console.log("\nWrote deployment record to", outPath);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
