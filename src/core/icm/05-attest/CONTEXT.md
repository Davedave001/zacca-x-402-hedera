# Stage 05 — attest

**Stage:** final stage of the ICM DCS-scoring pipeline.

**Inputs allowed:** the `ReviewResult` (Stage 04), the `IntakeResult`
(Stage 01, for the statement turnover and live `OracleQuote` needed to
compute the credit limit), and write access to the DCS attestation registry
(via the injected `ChainWriter`). This is the only stage permitted to write
on-chain.

**Output required:** an `AttestResult` -- the final score/tier/PD, the
computed `creditLimitStablecoinUnits` and `maxTenureMonths`
(`Credit Limit (USD) = Monthly Turnover (HBAR) x oracle HBAR/USD price x
Risk Multiplier`, then converted to the disbursed stablecoin's raw units --
an evolution of the Stage 1 formula, implementation plan §4, now properly
FX-converted instead of treating HBAR tinybars as 1:1 stablecoin units), a
`rationaleHash` (keccak256 of the full rationale trace, so the
*justification* is auditable on-chain and not just the number), and the
on-chain transaction reference once the attestation is committed to
`DCSRegistry` (implementation plan §6.3/§6.4). `CreditLine` reads this
attestation directly -- no API call back into a centralized scoring
service. If no oracle price was available in `IntakeResult` (both provider
reads failed), a conservative fallback price is used instead of failing
the whole pipeline -- see `FALLBACK_HBAR_USD_PRICE` in `index.ts`.
