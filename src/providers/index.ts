/**
 * Provider registry — THE one-line swap point.
 * DATA_PROVIDER=zacca-decentralized (default) | zacca-credit | mock
 */
import type { DataProvider } from "../core/provider.js";
import { CreditScoreProvider } from "./credit/credit-provider.js";
import { DecentralizedCreditProvider } from "./decentralized/decentralized-credit-provider.js";
import { MockDataProvider } from "./mock/mock-provider.js";

const PROVIDERS: Record<string, () => DataProvider> = {
  "zacca-decentralized": () => new DecentralizedCreditProvider(),
  "zacca-credit": () => new CreditScoreProvider(),
  mock: () => new MockDataProvider(),
};

export function getDataProvider(
  name = process.env.DATA_PROVIDER ?? "zacca-decentralized",
): DataProvider {
  const factory = PROVIDERS[name];
  if (!factory) {
    throw new Error(
      `Unknown DATA_PROVIDER "${name}". Valid options: ${Object.keys(PROVIDERS).join(", ")}`,
    );
  }
  return factory();
}
