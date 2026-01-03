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
  console.log("Enabling manual mode...");

  const tx = await ballot.connect(chairperson).enableManualMode();
  console.log("Tx hash:", tx.hash);
  await tx.wait();

  console.log("✅ Manual mode enabled");

  const manualMode = await ballot.manualMode();
  const stage = await ballot.stage();

  console.log("manualMode:", manualMode);
  console.log("stage (stored):", stage.toString());
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
