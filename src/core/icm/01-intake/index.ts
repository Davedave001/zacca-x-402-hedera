import { AbiCoder } from "ethers";
import type { ChainReader, IntakeResult, StatementStats } from "../types.js";

const abiCoder = AbiCoder.defaultAbiCoder();

/** See CONTEXT.md -- fetch and decode on-chain evidence, no judgment calls. */
export async function intake(businessId: string, chain: ChainReader): Promise<IntakeResult> {
  const [vbr, statement] = await Promise.all([
    chain.readVbrAttestation(businessId),
    chain.readStatementAttestation(businessId),
  ]);

  let statementStats: StatementStats | null = null;
  if (statement && statement.extra !== "0x") {
    const [periodStart, periodEnd, monthlyTurnoverTinybars] = abiCoder.decode(
      ["uint64", "uint64", "uint256"],
      statement.extra,
    );
    statementStats = {
      periodStart: Number(periodStart),
      periodEnd: Number(periodEnd),
      monthlyTurnoverTinybars: BigInt(monthlyTurnoverTinybars),
    };
  }

  return {
    businessId,
    vbrAttested: vbr !== null,
    vbrClaimHash: vbr?.claimHash ?? null,
    statementAttested: statement !== null,
    statement: statementStats,
  };
}
