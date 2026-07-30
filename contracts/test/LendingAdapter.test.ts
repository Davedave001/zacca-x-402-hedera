import { expect } from "chai";
import { network } from "hardhat";
import { AbiCoder } from "ethers";

describe("LendingAdapter", () => {
  const abiCoder = new AbiCoder();

  function encodeDcsExtra(
    dcs: number,
    pdBps: number,
    riskTier: string,
    limit: bigint,
    tenureMonths: number,
  ) {
    return abiCoder.encode(
      ["uint8", "uint16", "string", "uint256", "uint16"],
      [dcs, pdBps, riskTier, limit, tenureMonths],
    );
  }

  async function deploy() {
    const { ethers } = await network.create();
    const dcsRegistry = await ethers.deployContract("DCSRegistry");
    const adapter = await ethers.deployContract("LendingAdapter", [await dcsRegistry.getAddress()]);
    return { ethers, dcsRegistry, adapter };
  }

  const BUSINESS = "biz-alice-mboga";

  it("reports ineligible for a business with no DCS attestation", async () => {
    const { adapter } = await deploy();
    const terms = await adapter.getLoanTerms("unknown-business");
    expect(terms.eligible).to.equal(false);
    expect(terms.maxLoanToValueBps).to.equal(0);
  });

  it("computes tier-A loan terms (dcs>=80) at 90% max LTV", async () => {
    const { dcsRegistry, adapter } = await deploy();
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    await dcsRegistry.attest(BUSINESS, "0x" + "11".repeat(32), expiresAt, encodeDcsExtra(96, 107, "A", 16_000_000n, 3));

    const terms = await adapter.getLoanTerms(BUSINESS);
    expect(terms.eligible).to.equal(true);
    expect(terms.dcs).to.equal(96);
    expect(terms.riskTier).to.equal("A");
    expect(terms.maxLoanToValueBps).to.equal(9000);
    // rate = 500 + 107*3 = 821
    expect(terms.suggestedInterestRateBps).to.equal(821);
  });

  it("computes tier-C loan terms (50<=dcs<65) at 60% max LTV", async () => {
    const { dcsRegistry, adapter } = await deploy();
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    await dcsRegistry.attest(BUSINESS, "0x" + "22".repeat(32), expiresAt, encodeDcsExtra(50, 677, "C", 0n, 2));

    const terms = await adapter.getLoanTerms(BUSINESS);
    expect(terms.maxLoanToValueBps).to.equal(6000);
  });

  it("returns 0% max LTV (not eligible for a loan) for tier E (dcs<35)", async () => {
    const { dcsRegistry, adapter } = await deploy();
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    await dcsRegistry.attest(BUSINESS, "0x" + "33".repeat(32), expiresAt, encodeDcsExtra(20, 3000, "E", 0n, 0));

    const terms = await adapter.getLoanTerms(BUSINESS);
    expect(terms.eligible).to.equal(true); // has a valid attestation
    expect(terms.maxLoanToValueBps).to.equal(0); // but not creditworthy enough to borrow against
  });

  it("caps the suggested interest rate at 100% (10000 bps) for very high PD", async () => {
    const { dcsRegistry, adapter } = await deploy();
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    await dcsRegistry.attest(BUSINESS, "0x" + "44".repeat(32), expiresAt, encodeDcsExtra(35, 10_000, "D", 0n, 1));

    const terms = await adapter.getLoanTerms(BUSINESS);
    expect(terms.suggestedInterestRateBps).to.equal(10_000);
  });

  it("reflects a revoked attestation immediately -- reads live registry state, not a cache", async () => {
    const { dcsRegistry, adapter } = await deploy();
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    await dcsRegistry.attest(BUSINESS, "0x" + "55".repeat(32), expiresAt, encodeDcsExtra(70, 400, "B", 0n, 6));
    let terms = await adapter.getLoanTerms(BUSINESS);
    expect(terms.riskTier).to.equal("B");

    await dcsRegistry.revoke(BUSINESS);
    terms = await adapter.getLoanTerms(BUSINESS);
    expect(terms.eligible).to.equal(false);
  });
});
