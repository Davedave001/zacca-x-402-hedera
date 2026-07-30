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
import { HederaContractChainClient } from "../chain/client.js";
import { EvmPaymentError, verifyEvmPayment } from "./evm-payment.js";
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
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "PAYMENT-SIGNATURE", "X-PAYMENT"],
      exposeHeaders: ["PAYMENT-REQUIRED", "PAYMENT-RESPONSE", "X-PAYMENT-RESPONSE"],
    }),
  );

  app.get("/health", (c) => c.json({ status: "ok", provider: provider.name }));
  app.get("/catalog", (c) => c.json(buildCatalog(provider, config)));

  // Free (not x402-gated) -- this is the business submitting their own
  // evidence to Zacca, the opposite value-flow direction from the priced
  // GET endpoints. Zacca's backend reviews and attests on their behalf
  // (VBRRegistry's allowlisted-attestor model, plan §6.5) rather than
  // letting the wallet self-attest, which wouldn't be "verified" evidence.
  const vbrChain = new HederaContractChainClient();
  app.post("/vbr-input", async (c) => {
    let payload: Record<string, unknown>;
    try {
      payload = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const businessId = typeof payload.businessId === "string" ? payload.businessId.trim() : "";
    const businessName = typeof payload.businessName === "string" ? payload.businessName.trim() : "";
    if (!businessId || !businessName) {
      return c.json({ error: "businessId and businessName are required" }, 400);
    }
    const yearsInBusiness =
      typeof payload.yearsInBusiness === "number" && Number.isFinite(payload.yearsInBusiness)
        ? Math.max(0, Math.min(65535, Math.round(payload.yearsInBusiness)))
        : 0;
    const sector = typeof payload.sector === "string" ? payload.sector.trim() : "unspecified";

    try {
      const receipt = await vbrChain.writeVbrClaim(businessId, businessName, yearsInBusiness, sector);
      return c.json({
        businessId,
        businessName,
        yearsInBusiness,
        sector,
        onChain: receipt,
        note: "Re-run dcs-score/credit-limit for this businessId to see the credit limit recalculated against this new VBR evidence.",
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

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

  // MetaMask/EVM-wallet payment path: a plain eth_sendTransaction HBAR
  // transfer verified by receipt, instead of the native Hedera
  // TransferTransaction the x402 "exact" Hedera scheme below expects.
  // Triggered only by the presence of ?txHash= -- see src/server/evm-payment.ts
  // for why this is a parallel path, not a literal x402 scheme extension.
  // Runs before paymentMiddleware so a txHash request never also gets asked
  // for a native Hedera payment header.
  app.use("/data/:productId", async (c, next) => {
    const txHash = c.req.query("txHash");
    if (!txHash) return next();

    const product = requireProduct(provider, c.req.param("productId"));
    try {
      await verifyEvmPayment(txHash, BigInt(product.priceTinybars), config.payToAccount);
    } catch (err) {
      const message = err instanceof EvmPaymentError ? err.message : err instanceof Error ? err.message : String(err);
      return c.json({ error: "evm_payment_verification_failed", reason: message }, 402);
    }

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
