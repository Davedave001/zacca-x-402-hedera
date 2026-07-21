// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./AttestationRegistryBase.sol";

/// @notice On-chain attestation of DCS scoring results produced by the
/// ICM-structured LLM reasoning pipeline (implementation plan §6.3).
/// `extra` = abi.encode(uint8 dcs, uint16 probabilityOfDefaultBps,
/// string riskTier, uint256 creditLimitTinybars, uint16 maxTenureMonths)
/// -- the full 05-attest/ stage output, decodable by CreditLine (§6.4)
/// or any third party without trusting Zacca's backend.
contract DCSRegistry is AttestationRegistryBase {}
