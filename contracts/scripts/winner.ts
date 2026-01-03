import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

const CONTRACT_ADDRESS = process.env.BALLOT_ADDRESS || "";

async function main() {
  if (!CONTRACT_ADDRESS) {
    throw new Error("Missing BALLOT_ADDRESS in env");
  }

  // Attach to the deployed Ballot contract
  const ballot = await ethers.getContractAt("Ballot", CONTRACT_ADDRESS);

  // Read winner state
  const winnerComputed = await ballot.winnerComputed();
  const winningProposalId = await ballot.winningProposalId();

  console.log("winnerComputed:", winnerComputed);
  console.log("winningProposalId:", winningProposalId.toString());

  if (!winnerComputed) {
    console.log("⚠️ Winner not computed yet. Call finalize() first (or wait for Stage.Done).");
    return;
  }

  // Read winning proposal details
  const winner = await ballot.getProposal(winningProposalId);
  console.log("🏆 Winner:", {
    id: winningProposalId.toString(),
    name: winner.name,
    voteCount: winner.voteCount.toString(),
  });

  // Bonus: print all proposals (assumes 3 proposals: 0,1,2)
  const p0 = await ballot.getProposal(0);
  const p1 = await ballot.getProposal(1);
  const p2 = await ballot.getProposal(2);

  console.log("proposal[0]:", { name: p0.name, voteCount: p0.voteCount.toString() });
  console.log("proposal[1]:", { name: p1.name, voteCount: p1.voteCount.toString() });
  console.log("proposal[2]:", { name: p2.name, voteCount: p2.voteCount.toString() });
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
