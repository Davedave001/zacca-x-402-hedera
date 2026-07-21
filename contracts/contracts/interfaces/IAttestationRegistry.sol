// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Shared attest/read interface for Zacca's decentralized evidence
/// registries (VBR, Statement, DCS score) -- Zacca Credit Intelligence API
/// implementation plan, §6 "chain-agnostic by design". Every registry
/// implementing this holds only an attestor-signed claim hash plus
/// optional structured metadata, never the underlying bureau/statement
/// data itself.
interface IAttestationRegistry {
    struct Attestation {
        bytes32 claimHash;
        uint64 issuedAt;
        uint64 expiresAt;
        address attestor;
        bool revoked;
        bytes extra;
    }

    event Attested(
        string businessId,
        bytes32 claimHash,
        address indexed attestor,
        uint64 expiresAt
    );
    event Revoked(string businessId, address indexed attestor);

    /// @param extra Optional abi-encoded structured data (e.g. statement
    /// aggregate stats, or a DCS scoring result). Pass "" when unused.
    function attest(
        string calldata businessId,
        bytes32 claimHash,
        uint64 expiresAt,
        bytes calldata extra
    ) external;

    function revoke(string calldata businessId) external;

    function read(string calldata businessId) external view returns (Attestation memory);

    function isValid(string calldata businessId) external view returns (bool);
}
