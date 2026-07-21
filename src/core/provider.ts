/**
 * DataProvider contract — the swap point of the whole architecture.
 *
 * The x402 server wiring only ever talks to this interface. Swapping the
 * reference MockDataProvider for Zacca's CreditScoreProvider (or, later, a
 * provider backed by the real VBR Data Rail) changes nothing else.
 */

/** One purchasable product in a provider's catalog. */
export interface ProductSpec {
  /** URL-safe product id, used as the path segment: GET /data/<id> */
  id: string;
  /** Human-readable description shown in the catalog. */
  description: string;
  /** Names of required query parameters. */
  params: string[];
  /** Price in tinybars (1 HBAR = 100_000_000 tinybars), as a decimal string. */
  priceTinybars: string;
  /** Display price in HBAR, e.g. "0.02". */
  priceHbar: string;
}

/** Error thrown by providers for caller mistakes (maps to HTTP 4xx). */
export class ProviderRequestError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ProviderRequestError";
    this.status = status;
  }
}

export interface DataProvider {
  /** Provider name, reported in /catalog. */
  readonly name: string;
  /** Catalog of purchasable products. */
  readonly products: readonly ProductSpec[];
  /**
   * Produce the paid response body for a product.
   *
   * @param productId - id of a product from `products`
   * @param params - query parameters of the request
   * @throws ProviderRequestError for unknown products or missing params
   */
  fetch(
    productId: string,
    params: Record<string, string>,
  ): Promise<Record<string, unknown>>;
}

/** Look up a product spec or throw a 404-mapped error. */
export function requireProduct(
  provider: DataProvider,
  productId: string,
): ProductSpec {
  const product = provider.products.find((p) => p.id === productId);
  if (!product) {
    throw new ProviderRequestError(`Unknown product: ${productId}`, 404);
  }
  return product;
}

/** Validate that all required params are present and non-empty. */
export function requireParams(
  product: ProductSpec,
  params: Record<string, string>,
): void {
  for (const name of product.params) {
    if (!params[name] || params[name].trim() === "") {
      throw new ProviderRequestError(
        `Missing required parameter: ${name}`,
        400,
      );
    }
  }
}
