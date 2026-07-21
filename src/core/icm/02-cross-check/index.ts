import type { CrossCheckResult, IntakeResult } from "../types.js";

/**
 * Low-turnover threshold below which we flag the statement as thin evidence,
 * even though it's present -- 5 HBAR/month-equivalent (tinybars).
 */
const LOW_TURNOVER_THRESHOLD_TINYBARS = 500_000_000n;

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
