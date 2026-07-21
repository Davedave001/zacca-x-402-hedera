// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IAttestationRegistry.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Autonomous on-chain credit-limit decisioning + stablecoin
/// disbursement (implementation plan §6.4). Reads the DCS attestation
/// directly from an IAttestationRegistry -- any conforming registry works,
/// not just DCSRegistry, per the chain-agnostic design principle in §6 --
/// and lets a borrower draw down against their recommended limit in the
/// configured stablecoin. No API call back into a centralized scoring
/// service is needed to approve or fund a draw.
contract CreditLine {
    IAttestationRegistry public immutable dcsRegistry;
    IERC20 public immutable stablecoin;
    address public borrowerRegistrar;

    mapping(string => address) public businessWallet;
    mapping(string => uint256) public drawn;

    event WalletLinked(string businessId, address wallet);
    event Disbursed(string businessId, address indexed wallet, uint256 amount, uint256 totalDrawn);

    constructor(address dcsRegistryAddress, address stablecoinAddress) {
        dcsRegistry = IAttestationRegistry(dcsRegistryAddress);
        stablecoin = IERC20(stablecoinAddress);
        borrowerRegistrar = msg.sender;
    }

    /// @notice Links a business id to the wallet allowed to draw against
    /// its credit line. Owner-managed today (Stage 2); a self-service,
    /// signature-verified link is the natural Stage 3 upgrade.
    function linkWallet(string calldata businessId, address wallet) external {
        require(msg.sender == borrowerRegistrar, "CreditLine: not authorized");
        require(wallet != address(0), "CreditLine: zero address");
        businessWallet[businessId] = wallet;
        emit WalletLinked(businessId, wallet);
    }

    function creditLimit(string memory businessId) public view returns (uint256 limitTinybars, uint16 maxTenureMonths) {
        require(dcsRegistry.isValid(businessId), "CreditLine: no valid DCS attestation");
        IAttestationRegistry.Attestation memory a = dcsRegistry.read(businessId);
        (, , , uint256 limit, uint16 tenure) = abi.decode(
            a.extra,
            (uint8, uint16, string, uint256, uint16)
        );
        return (limit, tenure);
    }

    function availableCredit(string memory businessId) public view returns (uint256) {
        (uint256 limit, ) = creditLimit(businessId);
        uint256 used = drawn[businessId];
        return limit > used ? limit - used : 0;
    }

    /// @notice Draw down `amount` tinybars-equivalent of stablecoin against
    /// the business's recommended credit limit. Only the linked wallet may
    /// draw; the contract must hold enough stablecoin balance (the lending
    /// pool) to fund it.
    function draw(string calldata businessId, uint256 amount) external {
        address wallet = businessWallet[businessId];
        require(wallet != address(0), "CreditLine: no linked wallet");
        require(msg.sender == wallet, "CreditLine: only borrower");
        uint256 available = availableCredit(businessId);
        require(amount <= available, "CreditLine: exceeds available credit");
        drawn[businessId] += amount;
        require(stablecoin.transfer(wallet, amount), "CreditLine: transfer failed");
        emit Disbursed(businessId, wallet, amount, drawn[businessId]);
    }
}
