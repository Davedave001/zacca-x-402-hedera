# Stage 01 — intake

**Stage:** first stage of the ICM DCS-scoring pipeline.

**Inputs allowed:** a `businessId` string, and read-only access to the
on-chain VBR and Statement attestation registries (via the injected
`ChainReader`). Nothing else — no prior scoring history, no direct database
access.

**Input contract:** "verified attestation, any origin chain." This stage
does not assume the attestations are Hedera-native — a cross-chain
attestation bridge (implementation plan §6.1/§6.2) may be the actual source
by the time Stage 3 lands. Only the shape of the attestation (claim hash +
expiry + optional structured `extra`) is assumed.

**Output required:** an `IntakeResult` — whether a valid VBR attestation
exists, whether a valid Statement attestation exists, and the decoded
aggregate cash-flow stats from the Statement attestation's `extra` field
(period start/end, monthly turnover) if present. No scoring, no judgment
calls — this stage only fetches and decodes.
