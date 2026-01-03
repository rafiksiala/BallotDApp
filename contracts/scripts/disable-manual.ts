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
  console.log("Disabling manual mode (fallback to time-based)...");

  const tx = await ballot.connect(chairperson).disableManualMode();
  console.log("Tx hash:", tx.hash);
  await tx.wait();

  console.log("✅ Manual mode disabled");

  // stage is resynced inside disableManualMode() via _syncStage()
  const manualMode = await ballot.manualMode();
  const stageStored = await ballot.stage();
  const stageComputed = await ballot.currentStage();

  console.log("manualMode:", manualMode);
  console.log("stage (stored):", stageStored.toString());
  console.log("currentStage (computed):", stageComputed.toString());
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
