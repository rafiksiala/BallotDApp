import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Ballot", function () {
  async function deployFixture() {
    const [chair, alice, bob, eve] = await ethers.getSigners();

    const proposalNames = ["Alice", "Bob", "Charlie"];

    const now = await time.latest(); // number
    const regStart = BigInt(now + 10); // starts in 10s
    const regDuration = 100n;
    const voteDuration = 100n;

    const Ballot = await ethers.getContractFactory("Ballot");
    const ballot = await Ballot.deploy(proposalNames, regStart, regDuration, voteDuration);
    await ballot.waitForDeployment();

    const regEnd = Number(regStart + regDuration);
    const voteEnd = Number(regStart + regDuration + voteDuration);

    return { ballot, chair, alice, bob, eve, regStart: Number(regStart), regEnd, voteEnd };
  }

  it("initializes with chairperson weight=2 and stage Init", async () => {
    const { ballot, chair } = await deployFixture();

    const chairAddr = await chair.getAddress();

    const stage = await ballot.stage();
    expect(stage).to.equal(0); // Init

    const voter = await ballot.getVoter(chairAddr);
    expect(voter.weight).to.equal(2);
    expect(voter.voted).to.equal(false);
  });

  it("returns correct stage via currentStage() based on time", async () => {
    const { ballot, regStart, regEnd, voteEnd } = await deployFixture();

    expect(await ballot.currentStage()).to.equal(0); // Init

    await time.increaseTo(regStart + 1);
    expect(await ballot.currentStage()).to.equal(1); // Reg

    await time.increaseTo(regEnd + 1);
    expect(await ballot.currentStage()).to.equal(2); // Vote

    await time.increaseTo(voteEnd + 1);
    expect(await ballot.currentStage()).to.equal(3); // Done
  });

  it("allows only chair to register during Reg stage", async () => {
    const { ballot, chair, alice, eve, regStart } = await deployFixture();

    await time.increaseTo(regStart + 1);

    const aliceAddr = await alice.getAddress();
    await expect(ballot.connect(chair).register(aliceAddr))
      .to.emit(ballot, "VoterRegistered")
      .withArgs(aliceAddr, 1);

    // Non-chair cannot register
    const eveAddr = await eve.getAddress();
    await expect(ballot.connect(eve).register(eveAddr)).to.be.revertedWithCustomError(ballot, "OnlyChair");

    // Cannot register same address twice
    await expect(ballot.connect(chair).register(aliceAddr)).to.be.revertedWithCustomError(ballot, "AlreadyRegistered");
  });

  it("prevents registration outside Reg stage", async () => {
    const { ballot, chair, alice, regStart, voteEnd } = await deployFixture();
    const aliceAddr = await alice.getAddress();

    // Init stage (too early)
    await expect(ballot.connect(chair).register(aliceAddr)).to.be.revertedWithCustomError(ballot, "BadStage");

    // Done stage (too late)
    await time.increaseTo(voteEnd + 1);
    await expect(ballot.connect(chair).register(aliceAddr)).to.be.revertedWithCustomError(ballot, "BadStage");
  });

  it("allows voting only during Vote stage and only if registered", async () => {
    const { ballot, chair, alice, regStart, regEnd } = await deployFixture();

    // Move to Reg and register Alice
    await time.increaseTo(regStart + 1);
    await ballot.connect(chair).register(await alice.getAddress());

    // Still Reg: voting should fail
    await expect(ballot.connect(alice).vote(0)).to.be.revertedWithCustomError(ballot, "BadStage");

    // Move to Vote
    await time.increaseTo(regEnd + 1);

    // Unregistered voter cannot vote
    const [, , bob] = await ethers.getSigners();
    await expect(ballot.connect(bob).vote(0)).to.be.revertedWithCustomError(ballot, "NotRegistered");

    // Alice can vote
    await expect(ballot.connect(alice).vote(1))
      .to.emit(ballot, "VoteCast")
      .withArgs(await alice.getAddress(), 1, 1);

    // Alice cannot vote twice
    await expect(ballot.connect(alice).vote(2)).to.be.revertedWithCustomError(ballot, "AlreadyVoted");
  });

  it("counts weighted votes correctly (chair=2, others=1)", async () => {
    const { ballot, chair, alice, bob, regStart, regEnd } = await deployFixture();

    // Reg stage: register Alice and Bob
    await time.increaseTo(regStart + 1);
    await ballot.connect(chair).register(await alice.getAddress());
    await ballot.connect(chair).register(await bob.getAddress());

    // Vote stage
    await time.increaseTo(regEnd + 1);

    // Chair votes proposal 0 with weight=2
    await ballot.connect(chair).vote(0);

    // Alice votes proposal 0 with weight=1
    await ballot.connect(alice).vote(0);

    // Bob votes proposal 1 with weight=1
    await ballot.connect(bob).vote(1);

    const p0 = await ballot.getProposal(0);
    const p1 = await ballot.getProposal(1);

    expect(p0.voteCount).to.equal(3); // 2 + 1
    expect(p1.voteCount).to.equal(1);

    expect(await ballot.totalVotes()).to.equal(3);
    expect(await ballot.totalVoters()).to.equal(3); // chair + alice + bob
  });

  it("finalize() computes winner after Done, emits Finalized, and is idempotent", async () => {
    const { ballot, chair, alice, regStart, regEnd, voteEnd } = await deployFixture();

    // Reg: register Alice
    await time.increaseTo(regStart + 1);
    await ballot.connect(chair).register(await alice.getAddress());

    // Vote: chair votes 0 (weight 2), alice votes 1 (weight 1) => winner is 0
    await time.increaseTo(regEnd + 1);
    await ballot.connect(chair).vote(0);
    await ballot.connect(alice).vote(1);

    // Done
    await time.increaseTo(voteEnd + 1);

    const tx = await ballot.connect(alice).finalize();
    const receipt = await tx.wait();

    // Get the mined block timestamp
    const block = await ethers.provider.getBlock(receipt!.blockNumber);
    const ts = block!.timestamp;

    await expect(tx)
      .to.emit(ballot, "Finalized")
      .withArgs(0, 2, ts);

    expect(await ballot.winnerComputed()).to.equal(true);
    expect(await ballot.winningProposalId()).to.equal(0);

    // Second finalize does nothing (idempotent)
    await ballot.connect(chair).finalize();
    expect(await ballot.winningProposalId()).to.equal(0);
  });

  it("finalize() reverts if no votes were cast", async () => {
    const { ballot, regStart, voteEnd } = await deployFixture();

    await time.increaseTo(regStart + 1);
    // no votes

    await time.increaseTo(voteEnd + 1);
    await expect(ballot.finalize()).to.be.revertedWithCustomError(ballot, "NoVotesCast");
  });

  it("reverts on invalid proposal id", async () => {
    const { ballot, chair, regStart, regEnd } = await deployFixture();

    // Reg doesn't matter for invalid proposal check in getter
    await expect(ballot.getProposal(999)).to.be.revertedWithCustomError(ballot, "InvalidProposal");

    // Vote stage: invalid proposal id in vote()
    await time.increaseTo(regStart + 1);
    await time.increaseTo(regEnd + 1);

    await expect(ballot.connect(chair).vote(999)).to.be.revertedWithCustomError(ballot, "InvalidProposal");
  });
});
