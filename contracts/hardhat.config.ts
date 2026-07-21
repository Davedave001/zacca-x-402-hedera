import "dotenv/config";
import { defineConfig, configVariable } from "hardhat/config";
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";

export default defineConfig({
  plugins: [hardhatToolboxMochaEthers],
  solidity: "0.8.24",
  networks: {
    hederaTestnet: {
      type: "http",
      url: "https://testnet.hashio.io/api",
      chainId: 296,
      accounts: [configVariable("HEDERA_TESTNET_DEPLOYER_KEY")],
    },
  },
});
