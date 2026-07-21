// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./AttestationRegistryBase.sol";

/// @notice Decentralized bureau attestation registry (implementation plan
/// §6.1). Holds no raw bureau data -- only a hash of the underlying
/// Verified Business Record claim, signed on-chain by an allowlisted
/// attestor (a credit bureau, or Zacca's own backend acting as attestor
/// in the Stage 2 halfway state -- see AttestationRegistryBase).
contract VBRRegistry is AttestationRegistryBase {}
