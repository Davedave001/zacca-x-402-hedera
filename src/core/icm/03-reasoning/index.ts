import type { CrossCheckResult, IntakeResult, ReasoningDraft } from "../types.js";
import type { ReasoningClient } from "./reasoning-client.js";

/** See CONTEXT.md -- delegates to the injected ReasoningClient (LLM swap point). */
export async function reason(
  intake: IntakeResult,
  crossCheck: CrossCheckResult,
  client: ReasoningClient,
): Promise<ReasoningDraft> {
  return client.reason(intake, crossCheck);
}

export type { ReasoningClient } from "./reasoning-client.js";
export { StubReasoningClient } from "./reasoning-client.js";
