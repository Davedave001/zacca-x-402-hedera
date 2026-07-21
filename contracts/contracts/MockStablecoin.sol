// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Testnet-only stand-in for a real stablecoin (e.g. USDC on Hedera
/// via HTS, or a partner fintech's own stablecoin -- implementation plan
/// §6.4/§7). CreditLine disburses "directly in stablecoin"; this is that
/// stablecoin for demo purposes. NOT for production use -- owner-mintable.
contract MockStablecoin is ERC20, Ownable {
    constructor() ERC20("Zacca Testnet USD", "zUSD") Ownable(msg.sender) {}

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6; // matches USDC's 6 decimals
    }
}
