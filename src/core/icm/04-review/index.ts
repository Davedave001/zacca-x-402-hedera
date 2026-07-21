import { tierForDcs } from "../../dcs-scoring.js";
import type { ReasoningDraft, ReviewResult } from "../types.js";

/** See CONTEXT.md -- self-critique pass; corrects, never re-reasons. */
export function review(draft: ReasoningDraft): ReviewResult {
  const notes: string[] = [];

  let dcs = draft.dcs;
  if (!Number.isFinite(dcs) || dcs < 0 || dcs > 100) {
    notes.push(`Score ${dcs} out of [0,100] -- clamped.`);
    dcs = Math.min(100, Math.max(0, Number.isFinite(dcs) ? dcs : 0));
  }

  const expectedTier = tierForDcs(dcs).tier;
  let riskTier = draft.riskTier;
  if (riskTier !== expectedTier) {
    notes.push(
      `Risk tier "${riskTier}" doesn't match the tier band for score ${dcs} ("${expectedTier}") -- corrected.`,
    );
    riskTier = expectedTier;
  }

  let probabilityOfDefaultBps = draft.probabilityOfDefaultBps;
  if (!Number.isFinite(probabilityOfDefaultBps) || probabilityOfDefaultBps < 0 || probabilityOfDefaultBps > 10_000) {
    notes.push(`Probability of default ${probabilityOfDefaultBps}bps out of [0,10000] -- clamped.`);
    probabilityOfDefaultBps = Math.min(10_000, Math.max(0, probabilityOfDefaultBps || 0));
  }

  let rationale = draft.rationale;
  if (!rationale || rationale.length === 0) {
    notes.push("Rationale was empty -- this should never happen; flagging for audit.");
    rationale = ["(no rationale provided by reasoning stage)"];
  }

  if (notes.length === 0) {
    notes.push("Draft passed all consistency checks unchanged.");
  }

  return { dcs, riskTier, probabilityOfDefaultBps, rationale, reviewNotes: notes };
}
