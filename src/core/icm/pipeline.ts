/**
 * ICM pipeline orchestrator -- runs the five stages in order. See README.md
 * and each stage's CONTEXT.md for the contract each one implements.
 */
import { intake } from "./01-intake/index.js";
import { crossCheck } from "./02-cross-check/index.js";
import { reason } from "./03-reasoning/index.js";
import type { ReasoningClient } from "./03-reasoning/index.js";
import { review } from "./04-review/index.js";
import { attest } from "./05-attest/index.js";
import type { AttestResult, ChainReader, ChainWriter, OracleReader } from "./types.js";

export interface RunIcmPipelineOptions {
  businessId: string;
  chainReader: ChainReader;
  chainWriter: ChainWriter;
  reasoningClient: ReasoningClient;
  oracleReader: OracleReader;
}

export async function runIcmPipeline(options: RunIcmPipelineOptions): Promise<AttestResult> {
  const { businessId, chainReader, chainWriter, reasoningClient, oracleReader } = options;

  const intakeResult = await intake(businessId, chainReader, oracleReader);
  const crossCheckResult = crossCheck(intakeResult);
  const draft = await reason(intakeResult, crossCheckResult, reasoningClient);
  const reviewed = review(draft);
  const attested = await attest(businessId, intakeResult, reviewed, chainWriter);

  return attested;
}

export * from "./types.js";
export { StubReasoningClient } from "./03-reasoning/index.js";
