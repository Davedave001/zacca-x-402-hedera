# Stage 04 — review

**Stage:** fourth stage of the ICM DCS-scoring pipeline — self-critique,
before anything is finalized or committed on-chain.

**Inputs allowed:** only the `ReasoningDraft` produced by Stage 03. No
chain access, no re-reasoning from scratch -- this stage checks the draft
for internal consistency and methodology compliance, it doesn't redo the
work.

**Output required:** a `ReviewResult` -- the (possibly clamped/corrected)
final score, tier, and probability of default, plus `reviewNotes`
explaining any correction made. Checks performed: score in [0, 100], risk
tier matches the score band (`tierForDcs`), probability of default in
[0, 10000] bps, and a non-empty rationale. This is what catches a reasoning
error before it's committed on-chain in Stage 05.
