/**
 * Demonstrates the payoff of implementation plan §6.4: a business with an
 * on-chain DCS attestation draws down real stablecoin (zUSD, testnet) from
 * CreditLine -- decentralized credit-limit decisioning enabling stablecoin
 * lending, not just a data check.
 *
 * The demo wallet here is the same deployer/attestor account
 * (HEDERA_TESTNET_DEPLOYER_KEY) that seed-demo-business.ts linked to
 * biz-alice-mboga -- in a real deployment the borrower's own wallet would
 * hold this key and call draw() directly, with no API server in the loop.
 */
import "dotenv/config";
import { Contract, JsonRpcProvider, Wallet, formatUnits } from "ethers";
import { loadDeployment } from "../src/chain/deployment.js";

const BUSINESS_ID = process.env.E2E_SYMBOL ?? "biz-alice-mboga";
const DRAW_AMOUNT_ZUSD = process.env.DRAW_AMOUNT_ZUSD ?? "10";

const CREDIT_LINE_ABI = [
  "function availableCredit(string businessId) external view returns (uint256)",
  "function draw(string businessId, uint256 amount) external",
];
const ERC20_ABI = [
  "function balanceOf(address) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
];

async function main() {
  const key = process.env.HEDERA_TESTNET_DEPLOYER_KEY;
  if (!key) throw new Error("HEDERA_TESTNET_DEPLOYER_KEY not set in .env");

  const provider = new JsonRpcProvider(process.env.HEDERA_JSON_RPC_URL ?? "https://testnet.hashio.io/api");
  const signer = new Wallet(key, provider);
  const deployment = loadDeployment();

  const creditLine = new Contract(deployment.contracts.CreditLine, CREDIT_LINE_ABI, signer);
  const stablecoin = new Contract(deployment.contracts.MockStablecoin, ERC20_ABI, signer);

  const decimals: number = await stablecoin.getFunction("decimals")();
  const symbol: string = await stablecoin.getFunction("symbol")();
  const drawAmount = BigInt(DRAW_AMOUNT_ZUSD) * 10n ** BigInt(decimals);

  const available: bigint = await creditLine.getFunction("availableCredit")(BUSINESS_ID);
  console.log(`Available credit for "${BUSINESS_ID}": ${formatUnits(available, decimals)} ${symbol}`);

  const balanceBefore: bigint = await stablecoin.getFunction("balanceOf")(signer.address);
  console.log(`Borrower ${symbol} balance before: ${formatUnits(balanceBefore, decimals)}`);

  console.log(`\nDrawing ${DRAW_AMOUNT_ZUSD} ${symbol} against the credit line ...`);
  const tx = await creditLine.getFunction("draw")(BUSINESS_ID, drawAmount);
  const receipt = await tx.wait();
  console.log("draw() tx:", receipt.hash);

  const balanceAfter: bigint = await stablecoin.getFunction("balanceOf")(signer.address);
  console.log(`Borrower ${symbol} balance after: ${formatUnits(balanceAfter, decimals)}`);

  const availableAfter: bigint = await creditLine.getFunction("availableCredit")(BUSINESS_ID);
  console.log(`Remaining available credit: ${formatUnits(availableAfter, decimals)} ${symbol}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
