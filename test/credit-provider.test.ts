import { describe, expect, it } from "vitest";

import { ProviderRequestError } from "../src/core/provider.js";
import { CreditScoreProvider } from "../src/providers/credit/credit-provider.js";

const provider = new CreditScoreProvider();
const BIZ = "biz-alice-mboga";

describe("CreditScoreProvider catalog", () => {
  it("is named zacca-credit", () => {
    expect(provider.name).toBe("zacca-credit");
  });

  it("offers the three documented products at the documented prices", () => {
    const byId = Object.fromEntries(provider.products.map((p) => [p.id, p]));
    expect(Object.keys(byId).sort()).toEqual([
      "credit-limit",
      "dcs-score",
      "vbr-lookup",
    ]);
    expect(byId["vbr-lookup"]!.priceHbar).toBe("0.01");
    expect(byId["vbr-lookup"]!.priceTinybars).toBe("1000000");
    expect(byId["dcs-score"]!.priceHbar).toBe("0.02");
    expect(byId["dcs-score"]!.priceTinybars).toBe("2000000");
    expect(byId["credit-limit"]!.priceHbar).toBe("0.05");
    expect(byId["credit-limit"]!.priceTinybars).toBe("5000000");
  });

  it("requires businessId on every product", () => {
    for (const p of provider.products) {
      expect(p.params).toEqual(["businessId"]);
    }
  });
});

describe("CreditScoreProvider error handling", () => {
  it("throws 404 for unknown products", async () => {
    const err = await provider
      .fetch("no-such-product", { businessId: BIZ })
      .then(() => null)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ProviderRequestError);
    expect((err as ProviderRequestError).status).toBe(404);
  });

  it("throws 400 when businessId is missing", async () => {
    const err = await provider
      .fetch("dcs-score", {})
      .then(() => null)
      .catch((e) => e);
    expect(err).toBeInstanceOf(ProviderRequestError);
    expect((err as ProviderRequestError).status).toBe(400);
  });

  it("throws 400 when businessId is blank", async () => {
    await expect(
      provider.fetch("dcs-score", { businessId: "  " }),
    ).rejects.toBeInstanceOf(ProviderRequestError);
  });
});

describe("CreditScoreProvider responses", () => {
  it("vbr-lookup returns a boolean verification flag", async () => {
    const body = await provider.fetch("vbr-lookup", { businessId: BIZ });
    expect(body.product).toBe("vbr-lookup");
    expect(body.businessId).toBe(BIZ);
    expect(typeof body.vbrVerified).toBe("boolean");
  });

  it("dcs-score returns a 0-100 score and a valid tier", async () => {
    const body = await provider.fetch("dcs-score", { businessId: BIZ });
    expect(body.product).toBe("dcs-score");
    const dcs = body.dcs as number;
    expect(dcs).toBeGreaterThanOrEqual(0);
    expect(dcs).toBeLessThanOrEqual(100);
    expect(["A", "B", "C", "D", "E"]).toContain(body.riskTier);
  });

  it("credit-limit returns the full assessment", async () => {
    const body = await provider.fetch("credit-limit", { businessId: BIZ });
    expect(body.product).toBe("credit-limit");
    expect(body).toHaveProperty("dcs");
    expect(body).toHaveProperty("riskTier");
    expect(body).toHaveProperty("pillars");
    expect(body).toHaveProperty("probabilityOfDefault");
    expect(body).toHaveProperty("monthlyTurnoverKes");
    expect(body).toHaveProperty("recommendedCreditLimitKes");
    expect(body).toHaveProperty("maxTenureDays");
    expect(body).toHaveProperty("vbrVerified");
  });

  it("is deterministic for the same businessId across calls", async () => {
    const a = await provider.fetch("dcs-score", { businessId: BIZ });
    const b = await provider.fetch("dcs-score", { businessId: BIZ });
    expect(a.dcs).toBe(b.dcs);
    expect(a.riskTier).toBe(b.riskTier);
  });

  it("keeps the DCS consistent between dcs-score and credit-limit", async () => {
    const score = await provider.fetch("dcs-score", { businessId: BIZ });
    const full = await provider.fetch("credit-limit", { businessId: BIZ });
    expect(full.dcs).toBe(score.dcs);
    expect(full.riskTier).toBe(score.riskTier);
  });

  it("keeps vbrVerified consistent between vbr-lookup and credit-limit", async () => {
    const vbr = await provider.fetch("vbr-lookup", { businessId: BIZ });
    const full = await provider.fetch("credit-limit", { businessId: BIZ });
    expect(full.vbrVerified).toBe(vbr.vbrVerified);
  });

  it("computes credit limit as turnover x risk multiplier", async () => {
    const full = await provider.fetch("credit-limit", { businessId: BIZ });
    expect(full.recommendedCreditLimitKes).toBe(
      Math.round(
        (full.monthlyTurnoverKes as number) * (full.riskMultiplier as number),
      ),
    );
  });

  it("scores different businesses independently", async () => {
    const ids = Array.from({ length: 25 }, (_, i) => `biz-batch-${i}`);
    const scores = new Set<number>();
    for (const businessId of ids) {
      const body = await provider.fetch("dcs-score", { businessId });
      scores.add(body.dcs as number);
    }
    // 25 distinct businesses should not all collapse to one score.
    expect(scores.size).toBeGreaterThan(3);
  });
});
