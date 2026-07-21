# Stage 03 — reasoning

**Stage:** third stage of the ICM DCS-scoring pipeline — the deep reasoning
pass itself.

**Inputs allowed:** the `IntakeResult` (Stage 01) and `CrossCheckResult`
(Stage 02), plus Zacca's Stage 1/Stage 2 DCS methodology (cash-flow,
stability, customer-behaviour, operational features -- see
`src/core/dcs-scoring.ts`, §4 of the implementation plan). No chain access.

**Output required:** a `ReasoningDraft` -- a 0-100 DCS score, a probability
of default (basis points), a risk tier, and an ordered `rationale` (an
explicit chain-of-thought: what evidence was weighed, in what order, and
why it moved the score up or down). The rationale is not optional
decoration -- it's what Stage 05 hashes and commits on-chain as the audit
trail, so it must actually explain the score, not just restate it.

**LLM swap point:** this stage delegates to a `ReasoningClient`
(`reasoning-client.ts`). The current implementation, `StubReasoningClient`,
is a deterministic stand-in -- no external LLM call is made. A real
Claude-backed client implementing the same interface can be substituted
here without changing Stage 01, 02, 04, or 05.
