import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

const CONTRACT_ADDRESS = process.env.BALLOT_ADDRESS || "";

async function main() {
  if (!CONTRACT_ADDRESS) {
    throw new Error("Missing BALLOT_ADDRESS in env");
  }

  const [chairperson] = await ethers.getSigners();
  const ballot = await ethers.getContractAt("Ballot", CONTRACT_ADDRESS);

  console.log("Chairperson:", chairperson.address);
  console.log("Calling openRegistration()...");

  const tx = await ballot.connect(chairperson).openRegistration();
  console.log("Tx hash:", tx.hash);
  await tx.wait();

  console.log("✅ Registration opened");
  const stage = await ballot.stage();
  console.log("stage (stored):", stage.toString()); // 1 = Reg
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
