import { describe, expect, it } from "vitest";

import { getDataProvider } from "../src/providers/index.js";
import { CreditScoreProvider } from "../src/providers/credit/credit-provider.js";
import { MockDataProvider } from "../src/providers/mock/mock-provider.js";
import { buildCatalog, buildRoutes, createApp } from "../src/server/app.js";
import type { ServerConfig } from "../src/server/config.js";
import { loadServerConfig } from "../src/server/config.js";

const config: ServerConfig = {
  network: "hedera:testnet",
  facilitatorUrl: "https://api.testnet.blocky402.com",
  payToAccount: "0.0.1234",
  dataProvider: "zacca-credit",
  port: 4021,
  corsOrigins: ["http://localhost:5173"],
};

const provider = new CreditScoreProvider();

describe("provider registry", () => {
  it("defaults to the Zacca credit provider", () => {
    expect(getDataProvider("zacca-credit")).toBeInstanceOf(CreditScoreProvider);
  });

  it("can serve the reference mock provider", () => {
    expect(getDataProvider("mock")).toBeInstanceOf(MockDataProvider);
  });

  it("rejects unknown provider names", () => {
    expect(() => getDataProvider("nope")).toThrow(/Unknown DATA_PROVIDER/);
  });
});

describe("mock provider (reference parity)", () => {
  it("returns a deterministic quote per symbol", async () => {
    const mock = new MockDataProvider();
    const a = await mock.fetch("mock-quote", { symbol: "HBAR" });
    const b = await mock.fetch("mock-quote", { symbol: "HBAR" });
    expect(a.price).toBe(b.price);
    expect(typeof a.price).toBe("number");
  });
});

describe("loadServerConfig", () => {
  it("rejects a missing or malformed PAY_TO_ACCOUNT", () => {
    expect(() => loadServerConfig({} as NodeJS.ProcessEnv)).toThrow(
      /PAY_TO_ACCOUNT/,
    );
    expect(() =>
      loadServerConfig({ PAY_TO_ACCOUNT: "not-an-id" } as NodeJS.ProcessEnv),
    ).toThrow(/PAY_TO_ACCOUNT/);
  });

  it("applies documented defaults", () => {
    const cfg = loadServerConfig({
      PAY_TO_ACCOUNT: "0.0.1234",
    } as NodeJS.ProcessEnv);
    expect(cfg.network).toBe("hedera:testnet");
    expect(cfg.facilitatorUrl).toBe("https://api.testnet.blocky402.com");
    expect(cfg.dataProvider).toBe("zacca-decentralized");
    expect(cfg.port).toBe(4021);
    expect(cfg.corsOrigins).toEqual(["https://pay.zacca.ai", "http://localhost:5173"]);
  });
});

describe("buildCatalog / buildRoutes", () => {
  it("catalog lists every product with endpoint and pricing", () => {
    const catalog = buildCatalog(provider, config);
    expect(catalog.payTo).toBe("0.0.1234");
    expect(catalog.network).toBe("hedera:testnet");
    expect(catalog.products).toHaveLength(3);
    const dcs = catalog.products.find((p) => p.id === "dcs-score")!;
    expect(dcs.endpoint).toBe("/data/dcs-score");
    expect(dcs.priceHbar).toBe("0.02");
  });

  it("routes price each product in native HBAR tinybars", () => {
    const routes = buildRoutes(provider, config) as Record<
      string,
      { accepts: { payTo: string; network: string; price: { asset: string; amount: string } } }
    >;
    expect(Object.keys(routes).sort()).toEqual([
      "GET /data/credit-limit",
      "GET /data/dcs-score",
      "GET /data/vbr-lookup",
    ]);
    const dcs = routes["GET /data/dcs-score"]!;
    expect(dcs.accepts.payTo).toBe("0.0.1234");
    expect(dcs.accepts.network).toBe("hedera:testnet");
    expect(dcs.accepts.price).toEqual({ asset: "0.0.0", amount: "2000000" });
  });
});

describe("HTTP app (offline, payments disabled)", () => {
  const app = createApp(provider, config, { withPayments: false });

  it("GET /health responds ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe("ok");
  });

  it("GET /catalog serves the catalog", async () => {
    const res = await app.request("/catalog");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { products: unknown[] };
    expect(body.products).toHaveLength(3);
  });

  it("GET /data/dcs-score returns a score", async () => {
    const res = await app.request("/data/dcs-score?businessId=biz-alice-mboga");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dcs: number };
    expect(body.dcs).toBeGreaterThanOrEqual(0);
    expect(body.dcs).toBeLessThanOrEqual(100);
  });

  it("rejects unknown products with 404 before payment", async () => {
    const res = await app.request("/data/nope?businessId=biz-x");
    expect(res.status).toBe(404);
  });

  it("rejects missing params with 400 before payment", async () => {
    const res = await app.request("/data/dcs-score");
    expect(res.status).toBe(400);
  });
});
