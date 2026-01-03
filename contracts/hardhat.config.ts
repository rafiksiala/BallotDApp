import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "";
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || "";

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  networks: {
    hardhat: {},
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: [
        process.env.DEPLOYER_PRIVATE_KEY || "",
        process.env.VOTER1_PRIVATE_KEY || "",
        process.env.VOTER2_PRIVATE_KEY || "",
        process.env.VOTER3_PRIVATE_KEY || "",
      ].filter(Boolean),
    },
  },
};

export default config;
