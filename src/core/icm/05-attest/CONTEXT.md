# Stage 05 — attest

**Stage:** final stage of the ICM DCS-scoring pipeline.

**Inputs allowed:** the `ReviewResult` (Stage 04), the `IntakeResult`
(Stage 01, for the statement turnover needed to compute the credit limit),
and write access to the DCS attestation registry (via the injected
`ChainWriter`). This is the only stage permitted to write on-chain.

**Output required:** an `AttestResult` -- the final score/tier/PD, the
computed `creditLimitTinybars` and `maxTenureMonths`
(`Credit Limit = Monthly Turnover x Risk Multiplier`, same formula as Stage
1 -- implementation plan §4), a `rationaleHash` (keccak256 of the full
rationale trace, so the *justification* is auditable on-chain and not just
the number), and the on-chain transaction reference once the attestation is
committed to `DCSRegistry` (implementation plan §6.3/§6.4). `CreditLine`
reads this attestation directly -- no API call back into a centralized
scoring service.
