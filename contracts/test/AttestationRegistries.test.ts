import { expect } from "chai";
import { network } from "hardhat";

describe("AttestationRegistryBase (via VBRRegistry)", () => {
  async function deploy() {
    const { ethers } = await network.create();
    const [owner, attestor, other] = await ethers.getSigners();
    const registry = await ethers.deployContract("VBRRegistry");
    return { ethers, owner, attestor, other, registry };
  }

  it("makes the deployer the owner and an attestor", async () => {
    const { owner, registry } = await deploy();
    expect(await registry.owner()).to.equal(owner.address);
    expect(await registry.isAttestor(owner.address)).to.equal(true);
  });

  it("lets an attestor attest a claim, readable back exactly", async () => {
    const { ethers, owner, registry } = await deploy();
    const claimHash = ethers.keccak256(ethers.toUtf8Bytes("vbr:biz-alice-mboga"));
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;

    await expect(registry.attest("biz-alice-mboga", claimHash, expiresAt, "0x"))
      .to.emit(registry, "Attested")
      .withArgs("biz-alice-mboga", claimHash, owner.address, expiresAt);

    const a = await registry.read("biz-alice-mboga");
    expect(a.claimHash).to.equal(claimHash);
    expect(a.attestor).to.equal(owner.address);
    expect(a.revoked).to.equal(false);
    expect(await registry.isValid("biz-alice-mboga")).to.equal(true);
  });

  it("rejects attest() from a non-attestor", async () => {
    const { ethers, other, registry } = await deploy();
    const claimHash = ethers.keccak256(ethers.toUtf8Bytes("vbr:x"));
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    await expect(
      registry.connect(other).attest("biz-x", claimHash, expiresAt, "0x"),
    ).to.be.revertedWith("AttestationRegistry: not an attestor");
  });

  it("rejects an already-expired expiresAt", async () => {
    const { ethers, registry } = await deploy();
    const claimHash = ethers.keccak256(ethers.toUtf8Bytes("vbr:x"));
    await expect(
      registry.attest("biz-x", claimHash, 1, "0x"),
    ).to.be.revertedWith("AttestationRegistry: already expired");
  });

  it("owner can allowlist a new attestor, who can then attest", async () => {
    const { ethers, owner, attestor, registry } = await deploy();
    await registry.connect(owner).setAttestor(attestor.address, true);
    const claimHash = ethers.keccak256(ethers.toUtf8Bytes("vbr:y"));
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    await registry.connect(attestor).attest("biz-y", claimHash, expiresAt, "0x");
    expect(await registry.isValid("biz-y")).to.equal(true);
  });

  it("revoke() marks an attestation invalid", async () => {
    const { ethers, registry } = await deploy();
    const claimHash = ethers.keccak256(ethers.toUtf8Bytes("vbr:z"));
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    await registry.attest("biz-z", claimHash, expiresAt, "0x");
    expect(await registry.isValid("biz-z")).to.equal(true);

    await registry.revoke("biz-z");
    expect(await registry.isValid("biz-z")).to.equal(false);
    const a = await registry.read("biz-z");
    expect(a.revoked).to.equal(true);
  });

  it("isValid() is false for a business with no attestation at all", async () => {
    const { registry } = await deploy();
    expect(await registry.isValid("never-attested")).to.equal(false);
  });

  it("only the owner can add/remove attestors", async () => {
    const { other, attestor, registry } = await deploy();
    await expect(
      registry.connect(other).setAttestor(attestor.address, true),
    ).to.be.revertedWith("AttestationRegistry: not owner");
  });
});
