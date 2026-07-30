import { describe, expect, it } from "vitest";
import { hederaAccountIdToEvmAddress } from "../src/server/evm-payment.js";

describe("hederaAccountIdToEvmAddress", () => {
  it("computes the deterministic long-zero EVM address for a Hedera account id", () => {
    expect(hederaAccountIdToEvmAddress("0.0.9564717")).toBe("0x000000000000000000000000000000000091f22d");
  });

  it("handles small account numbers with correct zero-padding", () => {
    expect(hederaAccountIdToEvmAddress("0.0.802")).toBe("0x0000000000000000000000000000000000000322");
  });
});
