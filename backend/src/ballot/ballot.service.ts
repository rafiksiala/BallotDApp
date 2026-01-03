// NestJS decorator to declare an injectable service
// OnModuleInit allows us to run initialization logic when the module starts
import { Injectable, OnModuleInit } from "@nestjs/common";

// Ethers is used to interact with the Ethereum blockchain
import { ethers } from "ethers";

// Node.js utilities to read files from disk
import fs from "fs";
import path from "path";

// Type definition for the JSON file storing the contract address
// This helps with type safety when reading the file
type AddressJson = { address: string; network?: string };

@Injectable()
export class BallotService implements OnModuleInit {
  // JSON-RPC provider used for read-only blockchain access
  private provider!: ethers.JsonRpcProvider;

  // Ethers contract instance connected to the Ballot smart contract
  private contract!: ethers.Contract;

  // Deployed contract address (resolved from env or shared metadata)
  private contractAddress!: string;

  /**
   * This method is automatically called by NestJS
   * when the module is initialized.
   *
   * Its responsibility is to:
   * - create the RPC provider
   * - resolve the contract address
   * - load the ABI
   * - instantiate the contract
   */
  async onModuleInit() {
    // Read RPC URL from environment variables
    const rpc = process.env.SEPOLIA_RPC_URL;
    if (!rpc) throw new Error("Missing SEPOLIA_RPC_URL in backend/.env");

    // Create a read-only JSON-RPC provider (no signer, no private key)
    this.provider = new ethers.JsonRpcProvider(rpc);

    // Prefer the address from env (useful for deployments),
    // fallback to the shared metadata file if not provided
    this.contractAddress =
      process.env.BALLOT_ADDRESS?.trim() || this.loadAddressFromShared();

    // Load the ABI from the shared folder
    const abi = this.loadAbiFromShared();

    // Create the contract instance connected to the provider
    this.contract = new ethers.Contract(this.contractAddress, abi, this.provider);

    console.log("📘 BallotService connected:", this.contractAddress);
  }

  /**
   * Resolve the monorepo root directory.
   * When running in backend/, process.cwd() === ballot-dapp/backend
   * so we go one level up.
   */
  private repoRoot() {
    return path.resolve(process.cwd(), ".."); // ballot-dapp/
  }

  /**
   * Load the Ballot contract ABI from the shared metadata folder.
   * This keeps ABI and address in sync between backend and scripts.
   */
  private loadAbiFromShared() {
    const abiPath = path.join(
      this.repoRoot(),
      "shared",
      "contract-metadata",
      "Ballot.abi.json"
    );
    return JSON.parse(fs.readFileSync(abiPath, "utf-8"));
  }

  /**
   * Load the deployed contract address from the shared metadata folder.
   * Used as a fallback when BALLOT_ADDRESS is not set in env.
   */
  private loadAddressFromShared() {
    const addressPath = path.join(
      this.repoRoot(),
      "shared",
      "contract-metadata",
      "Ballot.address.json"
    );

    const parsed = JSON.parse(fs.readFileSync(addressPath, "utf-8")) as AddressJson;

    // Defensive check to avoid silent misconfiguration
    if (!parsed.address) throw new Error("Ballot.address.json missing 'address'");

    return parsed.address;
  }

  // ----------------------------
  // Read endpoints helpers
  // ----------------------------

  /**
   * Returns the global on-chain state of the ballot.
   * This method reads directly from the smart contract
   * and is considered the source of truth.
   */
  async getState() {
    // currentStage is computed on-chain (enum returned as bigint)
    const stage = await this.contract.currentStage();

    // Time window parameters defined at deployment
    const regStart = await this.contract.regStart();
    const regEnd = await this.contract.regEnd();
    const voteStart = await this.contract.voteStart();
    const voteEnd = await this.contract.voteEnd();

    // Aggregated counters maintained on-chain
    const totalVoters = await this.contract.totalVoters();
    const totalVotes = await this.contract.totalVotes();

    // Winner state (only valid after finalize)
    const winnerComputed = await this.contract.winnerComputed();
    const winningProposalId = await this.contract.winningProposalId();

    // Convert all bigints to strings for JSON safety
    return {
      contractAddress: this.contractAddress,
      stage: stage.toString(),
      regStart: regStart.toString(),
      regEnd: regEnd.toString(),
      voteStart: voteStart.toString(),
      voteEnd: voteEnd.toString(),
      totalVoters: totalVoters.toString(),
      totalVotes: totalVotes.toString(),
      winnerComputed,
      winningProposalId: winningProposalId.toString(),
    };
  }

  /**
   * Returns the list of proposals with their current vote counts.
   * This is a pure read-only on-chain operation.
   */
  async getProposals() {
    // Number of proposals defined at deployment
    const count = await this.contract.getProposalCount();

    const proposals: Array<{ id: string; name: string; voteCount: string }> = [];

    // Sequentially read each proposal from the contract
    for (let i = 0; i < Number(count); i++) {
      const p = await this.contract.getProposal(i);
      proposals.push({
        id: String(i),
        name: p.name,
        voteCount: p.voteCount.toString(),
      });
    }

    return proposals;
  }

  /**
   * Returns the winning proposal if the ballot has been finalized.
   * If finalize() has not been called yet, an explicit message is returned.
   */
  async getWinner() {
    const winnerComputed = await this.contract.winnerComputed();

    // Early return if the ballot is not finalized
    if (!winnerComputed) {
      return {
        winnerComputed: false,
        message: "Winner not computed yet. Call finalize() first.",
      };
    }

    // Read winning proposal id and fetch proposal details
    const winningProposalId = await this.contract.winningProposalId();
    const p = await this.contract.getProposal(winningProposalId);

    return {
      winnerComputed: true,
      winningProposalId: winningProposalId.toString(),
      name: p.name,
      voteCount: p.voteCount.toString(),
    };
  }
}
