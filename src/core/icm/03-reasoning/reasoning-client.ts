import { probabilityOfDefault, tierForDcs } from "../../dcs-scoring.js";
import type { CrossCheckResult, IntakeResult, ReasoningDraft } from "../types.js";

/**
 * The LLM swap point (see CONTEXT.md). A real implementation calls out to
 * Claude (or another model) with the intake + cross-check evidence and
 * returns a `ReasoningDraft`, including a genuine chain-of-thought
 * `rationale`. This interface is what that implementation must satisfy.
 */
export interface ReasoningClient {
  reason(intake: IntakeResult, crossCheck: CrossCheckResult): Promise<ReasoningDraft>;
}

/**
 * Deterministic stand-in -- no external LLM call. Produces a genuine,
 * traceable rationale from the same evidence a real model would see, using
 * Zacca's existing risk-tier/probability-of-default bands
 * (src/core/dcs-scoring.ts) so Stage 1 and this Stage-2 path stay
 * methodologically consistent. Swap this class out for a Claude-backed
 * client without touching any other pipeline stage.
 */
export class StubReasoningClient implements ReasoningClient {
  async reason(intake: IntakeResult, crossCheck: CrossCheckResult): Promise<ReasoningDraft> {
    const rationale: string[] = [];
    let score = 0;

    const baseByQuality: Record<CrossCheckResult["evidenceQuality"], number> = {
      strong: 70,
      moderate: 45,
      weak: 20,
    };
    score += baseByQuality[crossCheck.evidenceQuality];
    rationale.push(
      `Evidence quality assessed as "${crossCheck.evidenceQuality}" (VBR attested: ${intake.vbrAttested}, statement attested: ${intake.statementAttested}) -> base score ${baseByQuality[crossCheck.evidenceQuality]}.`,
    );

    if (intake.vbrAttested) {
      score += 10;
      rationale.push("Valid VBR attestation found -> +10.");
    } else {
      rationale.push("No valid VBR attestation -> no bureau-verification bonus applied.");
    }

    if (intake.statement) {
      const turnover = intake.statement.monthlyTurnoverTinybars;
      // log-scaled ramp: 1 HBAR/mo -> ~0, 1,000 HBAR/mo -> ~1 (tinybars: 1e8 .. 1e11)
      const logTurnover = Math.log10(Number(turnover > 0n ? turnover : 1n));
      const ramp = Math.min(1, Math.max(0, (logTurnover - 8) / (11 - 8)));
      const turnoverBonus = Math.round(25 * ramp);
      score += turnoverBonus;
      rationale.push(
        `Statement reports monthly turnover of ${turnover.toString()} tinybars -> turnover bonus +${turnoverBonus}.`,
      );
      if (intake.oracle) {
        const usdTurnover = (Number(turnover) / 1e8) * intake.oracle.price;
        rationale.push(
          `Normalized via ${intake.oracle.provider} ${intake.oracle.pair} @ $${intake.oracle.price.toFixed(5)} (${intake.oracle.ageSeconds}s old) -> approx. $${usdTurnover.toFixed(2)}/month USD-equivalent turnover.`,
        );
      }
    } else {
      rationale.push("No statement attestation -> no cash-flow bonus applied.");
    }

    if (crossCheck.flags.length > 0) {
      const penalty = Math.min(20, crossCheck.flags.length * 5);
      score -= penalty;
      rationale.push(
        `Cross-check raised ${crossCheck.flags.length} flag(s) [${crossCheck.flags.join("; ")}] -> penalty -${penalty}.`,
      );
    }

    const dcs = Math.round(Math.min(100, Math.max(0, score)));
    const policy = tierForDcs(dcs);
    const pd = probabilityOfDefault(dcs);
    rationale.push(
      `Composite score clamped to ${dcs}/100 -> risk tier ${policy.tier} (probability of default ${(pd * 100).toFixed(2)}%).`,
    );

    return {
      dcs,
      probabilityOfDefaultBps: Math.round(pd * 10_000),
      riskTier: policy.tier,
      rationale,
    };
  }
}
