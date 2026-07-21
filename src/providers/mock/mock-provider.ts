/**
 * MockDataProvider — re-implementation of the reference architecture's demo
 * provider, kept for comparison with CreditScoreProvider. Returns a
 * deterministic pseudo-quote for any symbol, seeded by the symbol string.
 */
import {
  type DataProvider,
  type ProductSpec,
  requireParams,
  requireProduct,
} from "../../core/provider.js";

const PRODUCTS: readonly ProductSpec[] = [
  {
    id: "mock-quote",
    description: "Deterministic pseudo-quote for a symbol (reference demo)",
    params: ["symbol"],
    priceTinybars: "100000",
    priceHbar: "0.001",
  },
];

function hashSeed(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export class MockDataProvider implements DataProvider {
  readonly name = "mock";
  readonly products = PRODUCTS;

  async fetch(
    productId: string,
    params: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const product = requireProduct(this, productId);
    requireParams(product, params);

    const symbol = params["symbol"]!;
    const seed = hashSeed(symbol);
    const price = Number((10 + (seed % 100_000) / 100).toFixed(2));

    return {
      product: productId,
      symbol,
      price,
      currency: "USD",
      generatedAt: new Date().toISOString(),
    };
  }
}
