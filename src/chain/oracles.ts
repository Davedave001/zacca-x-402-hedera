/**
 * Live price oracles feeding the ICM reasoning pipeline (src/core/icm/) and
 * the credit-limit computation. Both are real, deployed, independently
 * verified Hedera testnet oracle networks -- not simulated:
 *
 * - Pyth Network: pull oracle, contract 0xA2aa501b19aff244D90cc15a4Cf739D2725B5729
 *   (same address on Hedera mainnet and testnet). Read via getPriceUnsafe()
 *   -- the last on-chain-cached update, not a fresh pull -- since a fresh
 *   pull requires fetching a signed VAA from Pyth's Hermes API and paying an
 *   update fee in the same transaction; Hedera's ecosystem already keeps
 *   this feed reasonably fresh via other integrators' updates.
 * - Supra Oracles: push oracle, storage contract
 *   0x6Cd59830AAD978446e6cc7f6cc173aF7656Fb917, HBAR/USDT pair index 75.
 *   Simple view call, no fee, updated periodically by Supra's network.
 *
 * Both were confirmed live (non-zero, non-stale, mutually consistent
 * prices) by direct RPC call during development -- see IMPLEMENTATION_PLAN.md.
 */
import { Contract, JsonRpcProvider } from "ethers";

const RPC_URL = process.env.HEDERA_JSON_RPC_URL ?? "https://testnet.hashio.io/api";

let _provider: JsonRpcProvider | null = null;
function provider(): JsonRpcProvider {
  if (!_provider) _provider = new JsonRpcProvider(RPC_URL);
  return _provider;
}

export type OracleId = "pyth" | "supra";

export interface OracleQuote {
  provider: OracleId;
  pair: string;
  price: number;
  publishTime: number;
  ageSeconds: number;
}

export interface OracleProvider {
  readonly id: OracleId;
  readonly label: string;
  getHbarUsdPrice(): Promise<OracleQuote>;
}

const PYTH_ADDRESS = "0xA2aa501b19aff244D90cc15a4Cf739D2725B5729";
const PYTH_HBAR_USD_FEED_ID = "0x3728e591097635310e6341af53db8b7ee42da9b3a8d918f9463ce9cca886dfbd";
const PYTH_ABI = [
  "function getPriceUnsafe(bytes32 id) view returns (int64 price, uint64 conf, int32 expo, uint256 publishTime)",
];

export class PythOracleProvider implements OracleProvider {
  readonly id = "pyth" as const;
  readonly label = "Pyth Network";

  async getHbarUsdPrice(): Promise<OracleQuote> {
    const pyth = new Contract(PYTH_ADDRESS, PYTH_ABI, provider());
    const [price, , expo, publishTime] = await pyth.getFunction("getPriceUnsafe")(PYTH_HBAR_USD_FEED_ID);
    const publishTimeNum = Number(publishTime);
    return {
      provider: this.id,
      pair: "HBAR/USD",
      price: Number(price) * 10 ** Number(expo),
      publishTime: publishTimeNum,
      ageSeconds: Math.floor(Date.now() / 1000) - publishTimeNum,
    };
  }
}

const SUPRA_ADDRESS = "0x6Cd59830AAD978446e6cc7f6cc173aF7656Fb917";
const SUPRA_HBAR_USDT_PAIR_INDEX = 75;
const SUPRA_ABI = [
  "function getSvalue(uint256 _pairIndex) view returns (tuple(uint256 round, uint256 decimals, uint256 time, uint256 price))",
];

export class SupraOracleProvider implements OracleProvider {
  readonly id = "supra" as const;
  readonly label = "Supra Oracles";

  async getHbarUsdPrice(): Promise<OracleQuote> {
    const supra = new Contract(SUPRA_ADDRESS, SUPRA_ABI, provider());
    const result = await supra.getFunction("getSvalue")(SUPRA_HBAR_USDT_PAIR_INDEX);
    const publishTimeMs = Number(result.time);
    return {
      provider: this.id,
      pair: "HBAR/USDT",
      price: Number(result.price) / 10 ** Number(result.decimals),
      publishTime: Math.floor(publishTimeMs / 1000),
      ageSeconds: Math.floor(Date.now() / 1000) - Math.floor(publishTimeMs / 1000),
    };
  }
}

const PROVIDERS: Record<OracleId, () => OracleProvider> = {
  pyth: () => new PythOracleProvider(),
  supra: () => new SupraOracleProvider(),
};

export function getOracleProvider(id: OracleId = "pyth"): OracleProvider {
  const factory = PROVIDERS[id];
  if (!factory) throw new Error(`Unknown oracle provider "${id}". Valid options: ${Object.keys(PROVIDERS).join(", ")}`);
  return factory();
}
