// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IAttestationRegistry.sol";

/// @notice Base attest/read registry shared by VBRRegistry, StatementRegistry
/// and DCSRegistry. Implements Stage 2 of the decentralization roadmap
/// (implementation plan §6.5): a small, owner-managed attestor allowlist,
/// not a multi-bureau attestor quorum -- the quorum model is Stage 3 and
/// out of scope for this submission. One attestation per business per
/// registry; a new attest() call overwrites the previous one.
abstract contract AttestationRegistryBase is IAttestationRegistry {
    address public owner;
    mapping(address => bool) public isAttestor;
    mapping(string => Attestation) private _attestations;

    modifier onlyOwner() {
        require(msg.sender == owner, "AttestationRegistry: not owner");
        _;
    }

    modifier onlyAttestor() {
        require(isAttestor[msg.sender], "AttestationRegistry: not an attestor");
        _;
    }

    constructor() {
        owner = msg.sender;
        isAttestor[msg.sender] = true;
    }

    function setAttestor(address account, bool allowed) external onlyOwner {
        isAttestor[account] = allowed;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "AttestationRegistry: zero address");
        owner = newOwner;
    }

    function attest(
        string calldata businessId,
        bytes32 claimHash,
        uint64 expiresAt,
        bytes calldata extra
    ) external onlyAttestor {
        require(expiresAt > block.timestamp, "AttestationRegistry: already expired");
        _attestations[businessId] = Attestation({
            claimHash: claimHash,
            issuedAt: uint64(block.timestamp),
            expiresAt: expiresAt,
            attestor: msg.sender,
            revoked: false,
            extra: extra
        });
        emit Attested(businessId, claimHash, msg.sender, expiresAt);
    }

    function revoke(string calldata businessId) external onlyAttestor {
        require(_attestations[businessId].attestor != address(0), "AttestationRegistry: no attestation");
        _attestations[businessId].revoked = true;
        emit Revoked(businessId, msg.sender);
    }

    function read(string calldata businessId) external view returns (Attestation memory) {
        return _attestations[businessId];
    }

    function isValid(string calldata businessId) public view returns (bool) {
        Attestation storage a = _attestations[businessId];
        return a.attestor != address(0) && !a.revoked && a.expiresAt > block.timestamp;
    }
}
