import { describe, expect, it } from "vitest";
import { AbiCoder, keccak256, toUtf8Bytes } from "ethers";
import { intake } from "../src/core/icm/01-intake/index.js";
import { crossCheck } from "../src/core/icm/02-cross-check/index.js";
import { StubReasoningClient } from "../src/core/icm/03-reasoning/reasoning-client.js";
import { review } from "../src/core/icm/04-review/index.js";
import { runIcmPipeline } from "../src/core/icm/pipeline.js";
import type { AttestationView, ChainReader, ChainWriter } from "../src/core/icm/types.js";

const abiCoder = AbiCoder.defaultAbiCoder();

function attestation(extra: string): AttestationView {
  return {
    claimHash: keccak256(toUtf8Bytes("x")),
    issuedAt: 0,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    attestor: "0x0000000000000000000000000000000000000001",
    revoked: false,
    extra,
  };
}

function statementExtra(monthlyTurnoverTinybars: bigint) {
  return abiCoder.encode(["uint64", "uint64", "uint256"], [1000, 2000, monthlyTurnoverTinybars]);
}

class FakeChain implements ChainReader, ChainWriter {
  vbr: AttestationView | null = null;
  statement: AttestationView | null = null;
  attested: { businessId: string; claimHash: string; expiresAt: number; extra: string }[] = [];

  async readVbrAttestation() {
    return this.vbr;
  }
  async readStatementAttestation() {
    return this.statement;
  }
  async attestDcs(businessId: string, claimHash: string, expiresAt: number, extra: string) {
    this.attested.push({ businessId, claimHash, expiresAt, extra });
    return { transactionHash: "0xFAKE" };
  }
}

describe("ICM pipeline / 01-intake", () => {
  it("decodes a statement attestation's extra field", async () => {
    const chain = new FakeChain();
    chain.vbr = attestation("0x");
    chain.statement = attestation(statementExtra(50_000_000_000n));

    const result = await intake("biz-x", chain);
    expect(result.vbrAttested).toBe(true);
    expect(result.statementAttested).toBe(true);
    expect(result.statement?.monthlyTurnoverTinybars).toBe(50_000_000_000n);
    expect(result.statement?.periodStart).toBe(1000);
    expect(result.statement?.periodEnd).toBe(2000);
  });

  it("reports no attestations when the chain has none", async () => {
    const chain = new FakeChain();
    const result = await intake("biz-unknown", chain);
    expect(result.vbrAttested).toBe(false);
    expect(result.statementAttested).toBe(false);
    expect(result.statement).toBeNull();
  });
});

describe("ICM pipeline / 02-cross-check", () => {
  it("flags weak evidence when nothing is attested", () => {
    const result = crossCheck({
      businessId: "x",
      vbrAttested: false,
      vbrClaimHash: null,
      statementAttested: false,
      statement: null,
    });
    expect(result.evidenceQuality).toBe("weak");
    expect(result.flags.length).toBeGreaterThan(0);
  });

  it("rates strong evidence when both attestations are present with healthy turnover", () => {
    const result = crossCheck({
      businessId: "x",
      vbrAttested: true,
      vbrClaimHash: "0xabc",
      statementAttested: true,
      statement: { periodStart: 1000, periodEnd: 2000, monthlyTurnoverTinybars: 50_000_000_000n },
    });
    expect(result.evidenceQuality).toBe("strong");
    expect(result.flags).toHaveLength(0);
  });

  it("flags a zero-turnover statement even if attested", () => {
    const result = crossCheck({
      businessId: "x",
      vbrAttested: true,
      vbrClaimHash: "0xabc",
      statementAttested: true,
      statement: { periodStart: 1000, periodEnd: 2000, monthlyTurnoverTinybars: 0n },
    });
    expect(result.flags.some((f) => f.includes("zero"))).toBe(true);
  });
});

describe("ICM pipeline / 03-reasoning (StubReasoningClient)", () => {
  it("produces a higher score for strong evidence than weak evidence", async () => {
    const client = new StubReasoningClient();
    const strong = await client.reason(
      {
        businessId: "x",
        vbrAttested: true,
        vbrClaimHash: "0xabc",
        statementAttested: true,
        statement: { periodStart: 1000, periodEnd: 2000, monthlyTurnoverTinybars: 100_000_000_000n },
      },
      { evidenceQuality: "strong", flags: [] },
    );
    const weak = await client.reason(
      { businessId: "x", vbrAttested: false, vbrClaimHash: null, statementAttested: false, statement: null },
      { evidenceQuality: "weak", flags: ["no VBR or statement evidence on file"] },
    );
    expect(strong.dcs).toBeGreaterThan(weak.dcs);
    expect(strong.rationale.length).toBeGreaterThan(0);
    expect(weak.rationale.length).toBeGreaterThan(0);
  });

  it("keeps the score within [0,100] and PD within [0,10000] bps", async () => {
    const client = new StubReasoningClient();
    const result = await client.reason(
      {
        businessId: "x",
        vbrAttested: true,
        vbrClaimHash: "0xabc",
        statementAttested: true,
        statement: { periodStart: 1000, periodEnd: 2000, monthlyTurnoverTinybars: 1_000_000_000_000n },
      },
      { evidenceQuality: "strong", flags: [] },
    );
    expect(result.dcs).toBeGreaterThanOrEqual(0);
    expect(result.dcs).toBeLessThanOrEqual(100);
    expect(result.probabilityOfDefaultBps).toBeGreaterThanOrEqual(0);
    expect(result.probabilityOfDefaultBps).toBeLessThanOrEqual(10_000);
  });
});

describe("ICM pipeline / 04-review", () => {
  it("passes a consistent draft through unchanged (bar review notes)", () => {
    const reviewed = review({ dcs: 72, riskTier: "B", probabilityOfDefaultBps: 400, rationale: ["step 1"] });
    expect(reviewed.dcs).toBe(72);
    expect(reviewed.riskTier).toBe("B");
  });

  it("corrects a risk tier that doesn't match the score band", () => {
    const reviewed = review({ dcs: 10, riskTier: "A", probabilityOfDefaultBps: 400, rationale: ["step 1"] });
    expect(reviewed.riskTier).toBe("E");
    expect(reviewed.reviewNotes.some((n) => n.includes("doesn't match"))).toBe(true);
  });

  it("clamps an out-of-range score", () => {
    const reviewed = review({ dcs: 150, riskTier: "A", probabilityOfDefaultBps: 400, rationale: ["step 1"] });
    expect(reviewed.dcs).toBe(100);
  });
});

describe("ICM pipeline / full run", () => {
  it("runs all five stages and writes one attestation to the chain", async () => {
    const chain = new FakeChain();
    chain.vbr = attestation("0x");
    chain.statement = attestation(statementExtra(80_000_000_000n));

    const result = await runIcmPipeline({
      businessId: "biz-alice-mboga",
      chainReader: chain,
      chainWriter: chain,
      reasoningClient: new StubReasoningClient(),
    });

    expect(result.businessId).toBe("biz-alice-mboga");
    expect(result.dcs).toBeGreaterThan(0);
    expect(result.creditLimitTinybars).toBeGreaterThan(0n);
    expect(result.maxTenureMonths).toBeGreaterThanOrEqual(0);
    expect(result.onChain?.transactionHash).toBe("0xFAKE");
    expect(chain.attested).toHaveLength(1);
    expect(chain.attested[0]?.businessId).toBe("biz-alice-mboga");
  });
});
