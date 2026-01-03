import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  // Address of the deployed Ballot contract
  const ballotAddress = process.env.BALLOT_ADDRESS;
  if (!ballotAddress) {
    throw new Error("Missing BALLOT_ADDRESS in contracts/.env");
  }

  // Get signers configured for Sepolia in hardhat.config.ts
  const signers = await ethers.getSigners();

  // We expect:
  // signers[0] -> Deployer / Chairperson
  // signers[1] -> Voter 1
  // signers[2] -> Voter 2
  // signers[3] -> Voter 3
  if (signers.length < 4) {
    throw new Error(
      `Not enough signers on Sepolia. Got ${signers.length}, expected at least 4.`
    );
  }

  const [chairperson, voter1, voter2, voter3] = signers;

  // Attach to the deployed Ballot contract
  const ballot = await ethers.getContractAt("Ballot", ballotAddress);

  console.log("Chairperson:", chairperson.address);
  console.log("Registering voters:");
  console.log(" -", voter1.address);
  console.log(" -", voter2.address);
  console.log(" -", voter3.address);

  // Register voter 1
  const tx1 = await ballot.connect(chairperson).register(voter1.address);
  await tx1.wait();
  console.log("✅ Voter registered:", voter1.address);

  // Register voter 2
  const tx2 = await ballot.connect(chairperson).register(voter2.address);
  await tx2.wait();
  console.log("✅ Voter registered:", voter2.address);

  // Register voter 3
  const tx3 = await ballot.connect(chairperson).register(voter3.address);
  await tx3.wait();
  console.log("✅ Voter registered:", voter3.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
