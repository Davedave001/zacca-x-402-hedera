/** Hand-written minimal ABI fragments -- only what this API server calls. */

export const ATTESTATION_REGISTRY_ABI = [
  "function attest(string businessId, bytes32 claimHash, uint64 expiresAt, bytes extra) external",
  "function read(string businessId) external view returns (tuple(bytes32 claimHash, uint64 issuedAt, uint64 expiresAt, address attestor, bool revoked, bytes extra))",
  "function isValid(string businessId) external view returns (bool)",
];

export const CREDIT_LINE_ABI = [
  "function creditLimit(string businessId) external view returns (uint256 limitTinybars, uint16 maxTenureMonths)",
  "function availableCredit(string businessId) external view returns (uint256)",
  "function businessWallet(string businessId) external view returns (address)",
  "function drawn(string businessId) external view returns (uint256)",
];

export const MOCK_STABLECOIN_ABI = [
  "function balanceOf(address) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
];
