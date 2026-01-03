import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const signers = await ethers.getSigners();
  if (signers.length < 4) {
    throw new Error(`Not enough signers on Sepolia. Got ${signers.length}, expected at least 4.`);
  }

  const [deployer, voter1, voter2, voter3] = signers;

  // Amount to send to each voter (0.002 ETH is plenty for several txs)
  const amount = ethers.parseEther("0.002");

  console.log("Deployer:", deployer.address);

  for (const v of [voter1, voter2, voter3]) {
    const bal = await ethers.provider.getBalance(v.address);
    console.log("Current balance:", v.address, bal.toString());

    if (bal < amount) {
      const tx = await deployer.sendTransaction({
        to: v.address,
        value: amount,
      });
      console.log("Funding tx:", tx.hash);
      await tx.wait();
      console.log("✅ Funded:", v.address);
    } else {
      console.log("✅ Already funded:", v.address);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
