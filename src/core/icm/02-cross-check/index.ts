import type { CrossCheckResult, IntakeResult } from "../types.js";

/**
 * Low-turnover threshold below which we flag the statement as thin evidence,
 * even though it's present -- 5 HBAR/month-equivalent (tinybars).
 */
const LOW_TURNOVER_THRESHOLD_TINYBARS = 500_000_000n;

/** Oracle quotes older than this are flagged as potentially unreliable for FX conversion. */
const STALE_ORACLE_THRESHOLD_SECONDS = 3600;

/** See CONTEXT.md -- assess evidence quality, no scoring. */
export function crossCheck(intake: IntakeResult): CrossCheckResult {
  const flags: string[] = [];

  if (!intake.vbrAttested && !intake.statementAttested) {
    flags.push("no VBR or statement evidence on file");
    return { evidenceQuality: "weak", flags };
  }

  if (intake.vbrAttested && !intake.statementAttested) {
    flags.push("VBR record present but no cash-flow (statement) evidence to corroborate it");
  }

  if (!intake.vbrAttested && intake.statementAttested) {
    flags.push("cash-flow evidence present but no bureau (VBR) verification to corroborate it");
  }

  if (intake.statement) {
    if (intake.statement.monthlyTurnoverTinybars === 0n) {
      flags.push("statement reports zero monthly turnover");
    } else if (intake.statement.monthlyTurnoverTinybars < LOW_TURNOVER_THRESHOLD_TINYBARS) {
      flags.push("reported monthly turnover is low relative to typical MSME range");
    }
    if (intake.statement.periodEnd <= intake.statement.periodStart) {
      flags.push("statement period is malformed (end <= start)");
    }
  }

  if (!intake.oracle) {
    flags.push("no live oracle price available -- credit limit FX conversion may be unreliable");
  } else if (intake.oracle.ageSeconds > STALE_ORACLE_THRESHOLD_SECONDS) {
    flags.push(
      `${intake.oracle.provider} HBAR/USD price is ${Math.round(intake.oracle.ageSeconds / 60)} minutes old -- may not reflect the current rate`,
    );
  }

  // Strong requires both evidence sources AND no flags at all (including a
  // stale/missing oracle price) -- a great VBR+statement pair scored against
  // an unreliable FX rate isn't "strong" evidence for the resulting limit.
  let evidenceQuality: CrossCheckResult["evidenceQuality"];
  if (intake.vbrAttested && intake.statementAttested && flags.length === 0) {
    evidenceQuality = "strong";
  } else if (intake.vbrAttested || intake.statementAttested) {
    evidenceQuality = "moderate";
  } else {
    evidenceQuality = "weak";
  }

  return { evidenceQuality, flags };
}
