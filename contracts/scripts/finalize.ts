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
  if (signers.length < 1) {
    throw new Error("No signers available");
  }

  const caller = signers[0];

  // Attach to the deployed Ballot contract
  const ballot = await ethers.getContractAt("Ballot", CONTRACT_ADDRESS);

  // Check stage first
  const stage = await ballot.currentStage(); // 0=Init,1=Reg,2=Vote,3=Done
  console.log("currentStage:", stage.toString());

  if (stage.toString() !== "3") {
    // Print helpful timing info
    const voteEnd = await ballot.voteEnd();
    const latestBlock = await ethers.provider.getBlock("latest");
    const nowTs = latestBlock?.timestamp ?? 0;

    const remaining = Number(voteEnd) - Number(nowTs);
    console.log("voteEnd (unix):", voteEnd.toString());
    console.log("now (unix):", String(nowTs));
    console.log("seconds until Done:", remaining > 0 ? remaining : 0);

    throw new Error("Not in Stage.Done yet. Wait until the voting window ends.");
  }

  // Call finalize (anyone can call)
  console.log("Calling finalize() from:", caller.address);
  const tx = await ballot.connect(caller).finalize();
  console.log("Finalize tx:", tx.hash);
  await tx.wait();
  console.log("✅ Finalized");

  // Read winner info
  const winnerId = await ballot.winningProposalId();
  const winnerComputed = await ballot.winnerComputed();
  const winnerProposal = await ballot.getProposal(winnerId);

  console.log("winnerComputed:", winnerComputed);
  console.log("winningProposalId:", winnerId.toString());
  console.log("winner proposal:", {
    name: winnerProposal.name,
    voteCount: winnerProposal.voteCount.toString(),
  });
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
