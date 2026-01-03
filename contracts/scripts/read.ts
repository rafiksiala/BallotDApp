import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

const CONTRACT_ADDRESS = process.env.BALLOT_ADDRESS || "";

async function main() {
  if (!CONTRACT_ADDRESS) {
    throw new Error("Missing BALLOT_ADDRESS in env");
  }

  // Get signers configured for Sepolia
  const signers = await ethers.getSigners();
  if (signers.length < 4) {
    throw new Error(
      `Not enough signers on Sepolia. Got ${signers.length}, expected at least 4.`
    );
  }

  const [chairperson, voter1, voter2, voter3] = signers;

  // Attach to the deployed Ballot contract
  const ballot = await ethers.getContractAt("Ballot", CONTRACT_ADDRESS);

  // ----------------------------
  // Read ballot state
  // ----------------------------

  const stage = await ballot.currentStage();
  console.log("currentStage:", stage.toString()); // 0=Init,1=Reg,2=Vote,3=Done

  const p0 = await ballot.getProposal(0);
  const p1 = await ballot.getProposal(1);
  const p2 = await ballot.getProposal(2);

  console.log("\nProposal:");
  console.log("proposal[0]:", {
    name: p0.name,
    voteCount: p0.voteCount.toString(),
  });
  console.log("proposal[1]:", {
    name: p1.name,
    voteCount: p1.voteCount.toString(),
  });
  console.log("proposal[2]:", {
    name: p2.name,
    voteCount: p2.voteCount.toString(),
  });

  // ----------------------------
  // Read ETH balances (Sepolia)
  // ----------------------------

  const provider = ethers.provider;

  const balanceChair = await provider.getBalance(chairperson.address);
  const balanceV1 = await provider.getBalance(voter1.address);
  const balanceV2 = await provider.getBalance(voter2.address);
  const balanceV3 = await provider.getBalance(voter3.address);

  console.log("\nETH balances (Sepolia):");
  console.log(
    "Chairperson:",
    chairperson.address,
    ethers.formatEther(balanceChair),
    "ETH"
  );
  console.log(
    "Voter1:",
    voter1.address,
    ethers.formatEther(balanceV1),
    "ETH"
  );
  console.log(
    "Voter2:",
    voter2.address,
    ethers.formatEther(balanceV2),
    "ETH"
  );
  console.log(
    "Voter3:",
    voter3.address,
    ethers.formatEther(balanceV3),
    "ETH"
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
