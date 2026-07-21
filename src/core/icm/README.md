# ICM workspace — DCS scoring pipeline

Interpretable Context Methodology (implementation plan §6.3): instead of one
monolithic prompt, the DCS-scoring reasoning pass is a sequence of numbered
stage folders. Each folder is scoped to one job and carries its own
`CONTEXT.md` describing exactly what stage it is, what inputs it may use,
and what output it must produce. `pipeline.ts` orchestrates them in order.

- `01-intake/` — pulls on-chain evidence (VBR + Statement attestations) for a business.
- `02-cross-check/` — cross-references the evidence, flags inconsistencies.
- `03-reasoning/` — the deep reasoning pass itself (LLM call — see `reasoning-client.ts`).
- `04-review/` — self-critique pass before anything is finalized.
- `05-attest/` — finalizes score + rationale, hashes them, writes the on-chain attestation.

Each stage only sees the inputs its `CONTEXT.md` grants it, not the whole
pipeline history — right-sized per call, and independently inspectable: a
disputed score can be traced stage-by-stage rather than re-derived from one
opaque completion.

**LLM swap point:** `03-reasoning/reasoning-client.ts` defines the
`ReasoningClient` interface. `StubReasoningClient` (the current
implementation) is a deterministic stand-in — no external LLM call — clearly
marked so a real Claude-backed client can be dropped in without touching any
other stage.
