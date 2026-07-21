import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface DeploymentRecord {
  network: string;
  chainId: number;
  deployer: string;
  deployedAt: string;
  contracts: {
    VBRRegistry: string;
    StatementRegistry: string;
    DCSRegistry: string;
    MockStablecoin: string;
    CreditLine: string;
  };
}

let cached: DeploymentRecord | null = null;

/** Loads contracts/deployments/hederaTestnet.json, written by `contracts/scripts/deploy.ts`. */
export function loadDeployment(): DeploymentRecord {
  if (!cached) {
    const deploymentPath = path.join(__dirname, "..", "..", "contracts", "deployments", "hederaTestnet.json");
    cached = JSON.parse(readFileSync(deploymentPath, "utf-8"));
  }
  return cached!;
}
