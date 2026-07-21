// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./AttestationRegistryBase.sol";

/// @notice Decentralized payment/fintech statement attestation registry
/// (implementation plan §6.2). `extra` carries
/// abi.encode(uint64 periodStart, uint64 periodEnd, uint256 monthlyTurnoverTinybars)
/// -- aggregate cash-flow stats -- never the raw bank/fintech statement.
contract StatementRegistry is AttestationRegistryBase {}
