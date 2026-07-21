# Stage 02 — cross-check

**Stage:** second stage of the ICM DCS-scoring pipeline.

**Inputs allowed:** only the `IntakeResult` produced by Stage 01. No direct
chain access, no re-fetching -- this stage reasons over what intake already
gathered.

**Output required:** a `CrossCheckResult` -- an `evidenceQuality` tier
(`strong` / `moderate` / `weak`) and a list of human-readable `flags`
describing any inconsistency found (e.g. a VBR record with no statement
evidence, or a statement with implausibly low turnover). No score, no risk
tier -- this stage only assesses evidence quality for Stage 03 to weigh.
