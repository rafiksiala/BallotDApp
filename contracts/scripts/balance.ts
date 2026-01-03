import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer:", deployer.address);
  console.log("Balance (ETH):", ethers.formatEther(bal));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
