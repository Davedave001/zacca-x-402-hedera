import { expect } from "chai";
import { network } from "hardhat";
import { AbiCoder } from "ethers";

describe("CreditLine", () => {
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
    const [owner, borrower, other] = await ethers.getSigners();

    const dcsRegistry = await ethers.deployContract("DCSRegistry");
    const stablecoin = await ethers.deployContract("MockStablecoin");
    const creditLine = await ethers.deployContract("CreditLine", [
      await dcsRegistry.getAddress(),
      await stablecoin.getAddress(),
    ]);

    // Fund the CreditLine contract as the lending pool.
    await stablecoin.mint(await creditLine.getAddress(), ethers.parseUnits("1000000", 6));

    return { ethers, owner, borrower, other, dcsRegistry, stablecoin, creditLine };
  }

  const BUSINESS = "biz-alice-mboga";
  const LIMIT = 45n * 10n ** 6n; // 45 zUSD (6 decimals), matching a $45 recommended limit

  it("computes availableCredit from the DCS attestation's encoded extra", async () => {
    const { dcsRegistry, creditLine } = await deploy();
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    await dcsRegistry.attest(
      BUSINESS,
      "0x" + "11".repeat(32),
      expiresAt,
      encodeDcsExtra(45, 3200, "D", LIMIT, 6),
    );

    const [limit, tenure] = await creditLine.creditLimit(BUSINESS);
    expect(limit).to.equal(LIMIT);
    expect(tenure).to.equal(6);
    expect(await creditLine.availableCredit(BUSINESS)).to.equal(LIMIT);
  });

  it("reverts creditLimit()/availableCredit() when there's no valid DCS attestation", async () => {
    const { creditLine } = await deploy();
    await expect(creditLine.availableCredit("unknown-business")).to.be.revertedWith(
      "CreditLine: no valid DCS attestation",
    );
  });

  it("lets the linked wallet draw down stablecoin within the limit", async () => {
    const { ethers, dcsRegistry, stablecoin, creditLine, owner, borrower } = await deploy();
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    await dcsRegistry.attest(
      BUSINESS,
      "0x" + "22".repeat(32),
      expiresAt,
      encodeDcsExtra(45, 3200, "D", LIMIT, 6),
    );
    await creditLine.connect(owner).linkWallet(BUSINESS, borrower.address);

    const drawAmount = 20n * 10n ** 6n;
    await expect(creditLine.connect(borrower).draw(BUSINESS, drawAmount))
      .to.emit(creditLine, "Disbursed")
      .withArgs(BUSINESS, borrower.address, drawAmount, drawAmount);

    expect(await stablecoin.balanceOf(borrower.address)).to.equal(drawAmount);
    expect(await creditLine.availableCredit(BUSINESS)).to.equal(LIMIT - drawAmount);
  });

  it("rejects a draw that exceeds the available credit", async () => {
    const { dcsRegistry, creditLine, owner, borrower } = await deploy();
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    await dcsRegistry.attest(
      BUSINESS,
      "0x" + "33".repeat(32),
      expiresAt,
      encodeDcsExtra(45, 3200, "D", LIMIT, 6),
    );
    await creditLine.connect(owner).linkWallet(BUSINESS, borrower.address);

    await expect(
      creditLine.connect(borrower).draw(BUSINESS, LIMIT + 1n),
    ).to.be.revertedWith("CreditLine: exceeds available credit");
  });

  it("rejects a draw from a wallet that isn't linked to the business", async () => {
    const { dcsRegistry, creditLine, owner, borrower, other } = await deploy();
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    await dcsRegistry.attest(
      BUSINESS,
      "0x" + "44".repeat(32),
      expiresAt,
      encodeDcsExtra(45, 3200, "D", LIMIT, 6),
    );
    await creditLine.connect(owner).linkWallet(BUSINESS, borrower.address);

    await expect(creditLine.connect(other).draw(BUSINESS, 1n)).to.be.revertedWith(
      "CreditLine: only borrower",
    );
  });

  it("only the registrar (deployer) can link a wallet", async () => {
    const { creditLine, other, borrower } = await deploy();
    await expect(
      creditLine.connect(other).linkWallet(BUSINESS, borrower.address),
    ).to.be.revertedWith("CreditLine: not authorized");
  });
});
