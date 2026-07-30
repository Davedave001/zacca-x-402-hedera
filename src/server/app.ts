/**
 * Hono app wiring: pre-validation -> x402 paymentMiddleware -> handler.
 *
 * The payment middleware only guards /data/*. Pre-validation runs BEFORE it,
 * so an unknown product or missing parameter returns 4xx without ever
 * issuing a 402 — nobody pays for an error.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { paymentMiddleware, x402ResourceServer } from "@x402/hono";
import {
  HTTPFacilitatorClient,
  type RouteConfig,
  type RoutesConfig,
} from "@x402/core/server";
import type { Network } from "@x402/core/types";
import { ExactHederaScheme } from "@x402/hedera/exact/server";

import {
  type DataProvider,
  ProviderRequestError,
  requireParams,
  requireProduct,
} from "../core/provider.js";
import type { ServerConfig } from "./config.js";

/** Catalog document served at GET /catalog. */
export function buildCatalog(provider: DataProvider, config: ServerConfig) {
  return {
    service: "Zacca Credit Intelligence API (x402 on Hedera)",
    provider: provider.name,
    network: config.network,
    payTo: config.payToAccount,
    products: provider.products.map((p) => ({
      id: p.id,
      description: p.description,
      params: p.params,
      priceHbar: p.priceHbar,
      priceTinybars: p.priceTinybars,
      endpoint: `/data/${p.id}`,
    })),
  };
}

/** x402 route config: one paid route per catalog product. */
export function buildRoutes(
  provider: DataProvider,
  config: ServerConfig,
): RoutesConfig {
  const routes: Record<string, RouteConfig> = {};
  for (const p of provider.products) {
    routes[`GET /data/${p.id}`] = {
      accepts: {
        scheme: "exact",
        network: config.network as Network,
        payTo: config.payToAccount,
        // Native HBAR, amount in tinybars.
        price: { asset: "0.0.0", amount: p.priceTinybars },
        maxTimeoutSeconds: 120,
      },
      description: p.description,
      mimeType: "application/json",
      serviceName: "zacca-credit-intelligence",
      unpaidResponseBody: () => ({
        contentType: "application/json",
        body: {
          error: "payment_required",
          hint: `Pay ${p.priceHbar} HBAR via the x402 flow to receive this resource.`,
          product: p.id,
        },
      }),
      settlementFailedResponseBody: (_context, failure) => {
        console.error(`[settle] ${p.id} settlement failed:`, failure.errorReason, failure.errorMessage);
        return {
          contentType: "application/json",
          body: {
            error: "settlement_failed",
            reason: failure.errorReason,
            product: p.id,
          },
        };
      },
    };
  }
  return routes;
}

export interface CreateAppOptions {
  /**
   * When false, the x402 payment middleware is not mounted (offline mode for
   * tests — /data routes respond without payment).
   */
  withPayments?: boolean;
}

export function createApp(
  provider: DataProvider,
  config: ServerConfig,
  options: CreateAppOptions = {},
): Hono {
  const { withPayments = true } = options;
  const app = new Hono();

  // Lets the browser frontend (pay.zacca.ai) call this API directly, including
  // reading/sending the x402 payment challenge/signature/settlement headers,
  // which aren't part of the CORS-safelisted header set by default.
  app.use(
    "*",
    cors({
      origin: config.corsOrigins,
      allowMethods: ["GET", "OPTIONS"],
      allowHeaders: ["Content-Type", "PAYMENT-SIGNATURE", "X-PAYMENT"],
      exposeHeaders: ["PAYMENT-REQUIRED", "PAYMENT-RESPONSE", "X-PAYMENT-RESPONSE"],
    }),
  );

  app.get("/health", (c) => c.json({ status: "ok", provider: provider.name }));
  app.get("/catalog", (c) => c.json(buildCatalog(provider, config)));

  // Pre-validation: reject unknown products / missing params before payment.
  app.use("/data/:productId", async (c, next) => {
    try {
      const product = requireProduct(provider, c.req.param("productId"));
      requireParams(product, c.req.query());
    } catch (err) {
      if (err instanceof ProviderRequestError) {
        return c.json({ error: err.message }, err.status as 400 | 404);
      }
      throw err;
    }
    await next();
  });

  if (withPayments) {
    const facilitator = new HTTPFacilitatorClient({
      url: config.facilitatorUrl,
    });
    const resourceServer = new x402ResourceServer(facilitator).register(
      config.network as Network,
      new ExactHederaScheme(),
    );
    app.use(
      "/data/*",
      paymentMiddleware(buildRoutes(provider, config), resourceServer),
    );
  }

  app.get("/data/:productId", async (c) => {
    try {
      const body = await provider.fetch(c.req.param("productId"), c.req.query());
      return c.json(body);
    } catch (err) {
      if (err instanceof ProviderRequestError) {
        return c.json({ error: err.message }, err.status as 400 | 404);
      }
      throw err;
    }
  });

  return app;
}
