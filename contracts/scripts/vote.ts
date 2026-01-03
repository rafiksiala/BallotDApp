import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
    // Ballot contract address
    const ballotAddress = process.env.BALLOT_ADDRESS;
    if (!ballotAddress) {
        throw new Error("Missing BALLOT_ADDRESS in contracts/.env");
    }

    // Get signers configured for Sepolia
    const signers = await ethers.getSigners();
    if (signers.length < 4) {
        throw new Error(`Not enough signers on Sepolia. Got ${signers.length}, expected at least 4.`);
    }

    const [chairperson, voter1, voter2, voter3] = signers;

    // Attach to the deployed Ballot contract
    const ballot = await ethers.getContractAt("Ballot", ballotAddress);

    // Check stage before voting
    const stage = await ballot.currentStage(); // 0=Init,1=Reg,2=Vote,3=Done
    console.log("Current stage:", stage.toString());

    if (stage.toString() !== "2") {
        const regEnd = await ballot.regEnd();
        const voteEnd = await ballot.voteEnd();
        console.log("regEnd (unix):", regEnd.toString());
        console.log("voteEnd (unix):", voteEnd.toString());
        throw new Error("Not in Stage.Vote yet. Wait until voting window starts.");
    }

    // Choose proposal ids for each voter (0=Alice, 1=Bob, 2=Charlie)
    const voter1Choice = 0;
    const voter2Choice = 1;
    const voter3Choice = 0;

    console.log("Chairperson:", chairperson.address);
    console.log("Voter1:", voter1.address, "-> proposal", voter1Choice);
    console.log("Voter2:", voter2.address, "-> proposal", voter2Choice);
    console.log("Voter3:", voter3.address, "-> proposal", voter3Choice);

    console.log("Voter1 balance:", (await ethers.provider.getBalance(chairperson.address)).toString());
    console.log("Voter1 balance:", (await ethers.provider.getBalance(voter1.address)).toString());
    console.log("Voter2 balance:", (await ethers.provider.getBalance(voter2.address)).toString());
    console.log("Voter3 balance:", (await ethers.provider.getBalance(voter3.address)).toString());

    // Cast votes
    const tx1 = await ballot.connect(voter1).vote(voter1Choice);
    console.log("Vote tx1:", tx1.hash);
    await tx1.wait();
    console.log("✅ Voter1 voted");

    const tx2 = await ballot.connect(voter2).vote(voter2Choice);
    console.log("Vote tx2:", tx2.hash);
    await tx2.wait();
    console.log("✅ Voter2 voted");

    const tx3 = await ballot.connect(voter3).vote(voter3Choice);
    console.log("Vote tx3:", tx3.hash);
    await tx3.wait();
    console.log("✅ Voter3 voted");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
