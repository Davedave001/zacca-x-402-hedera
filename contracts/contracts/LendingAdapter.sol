// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IAttestationRegistry.sol";

/// @notice Protocol-agnostic credit-oracle adapter (implementation plan
/// §12.5): exposes Zacca's DCS attestation as a simple, standard view
/// function any external lending protocol -- an Aave-fork-style money
/// market, a BNPL underwriter, a keeper bot -- can call to price an
/// undercollateralized loan, with no API key, payment, or relationship
/// with Zacca required at call time. The attestation itself is what's
/// trusted (same on-chain-attestation model as CreditLine), not a
/// runtime call back into Zacca's backend.
///
/// Deliberately NOT integrated with a specific third-party protocol's ABI.
/// Bonzo Finance, Hedera's largest lending protocol, was exploited for
/// ~$9M via oracle-price manipulation (a Supra signature-verification
/// flaw) on 2026-07-11 and is currently paused for recovery -- integrating
/// live with a paused/compromised protocol's contracts would not be a
/// sound choice for this submission. This adapter is the stable,
/// protocol-agnostic interface any lending protocol (Bonzo once restored,
/// or a future one) can consume once ready.
contract LendingAdapter {
    IAttestationRegistry public immutable dcsRegistry;

    struct LoanTerms {
        bool eligible;
        uint8 dcs;
        string riskTier;
        /// @dev Basis points, e.g. 7500 = 75% max loan-to-value.
        uint16 maxLoanToValueBps;
        /// @dev Basis points, annualized, e.g. 800 = 8%.
        uint16 suggestedInterestRateBps;
    }

    constructor(address dcsRegistryAddress) {
        dcsRegistry = IAttestationRegistry(dcsRegistryAddress);
    }

    /// @notice Computes suggested loan terms for a business from its DCS
    /// attestation. Pure view -- callable by any contract or off-chain
    /// service without payment or permission.
    function getLoanTerms(string calldata businessId) external view returns (LoanTerms memory) {
        if (!dcsRegistry.isValid(businessId)) {
            return LoanTerms({eligible: false, dcs: 0, riskTier: "", maxLoanToValueBps: 0, suggestedInterestRateBps: 0});
        }

        IAttestationRegistry.Attestation memory a = dcsRegistry.read(businessId);
        (uint8 dcs, uint16 pdBps, string memory riskTier, , ) = abi.decode(
            a.extra,
            (uint8, uint16, string, uint256, uint16)
        );

        return LoanTerms({
            eligible: true,
            dcs: dcs,
            riskTier: riskTier,
            maxLoanToValueBps: _ltvForDcs(dcs),
            suggestedInterestRateBps: _rateForPd(pdBps)
        });
    }

    /// @dev Tier bands mirror the risk-tier bands already used for the
    /// credit-limit multiplier (src/core/dcs-scoring.ts TIER_POLICIES) --
    /// higher score, higher allowable LTV.
    function _ltvForDcs(uint8 dcs) internal pure returns (uint16) {
        if (dcs >= 80) return 9000; // tier A -> 90%
        if (dcs >= 65) return 7500; // tier B -> 75%
        if (dcs >= 50) return 6000; // tier C -> 60%
        if (dcs >= 35) return 4000; // tier D -> 40%
        return 0; // tier E -> not eligible
    }

    /// @dev Simple risk-based markup over a 5% base rate, capped at 100%.
    function _rateForPd(uint16 pdBps) internal pure returns (uint16) {
        uint256 rate = 500 + (uint256(pdBps) * 3);
        return rate > 10000 ? 10000 : uint16(rate);
    }
}
