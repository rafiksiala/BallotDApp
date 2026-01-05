// src/ballot/ballot.writer.ts
// Server-side writer for chairperson actions (register + finalize).
// This uses a private key stored in backend/.env (testnet only).

import { Injectable, OnModuleInit } from "@nestjs/common";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";

type AddressJson = { address: string; network?: string };

@Injectable()
export class BallotWriter implements OnModuleInit {
  private provider!: ethers.JsonRpcProvider;
  private signer!: ethers.Wallet;
  private contract!: ethers.Contract;
  private contractAddress!: string;

  async onModuleInit() {
    const rpc = process.env.SEPOLIA_RPC_URL;
    if (!rpc) throw new Error("Missing SEPOLIA_RPC_URL in backend/.env");

    const pk = process.env.CHAIRPERSON_PRIVATE_KEY;
    if (!pk) throw new Error("Missing CHAIRPERSON_PRIVATE_KEY in backend/.env");

    this.provider = new ethers.JsonRpcProvider(rpc);
    this.signer = new ethers.Wallet(pk, this.provider);

    this.contractAddress =
      process.env.BALLOT_ADDRESS?.trim() || this.loadAddressFromShared();

    const abi = this.loadAbiFromShared();
    this.contract = new ethers.Contract(this.contractAddress, abi, this.signer);

    console.log("✍️ BallotWriter ready:", {
      contract: this.contractAddress,
      chairperson: await this.signer.getAddress(),
    });
  }

  private repoRoot() {
    return path.resolve(process.cwd(), ".."); // ballot-dapp/
  }

  private loadAbiFromShared() {
    const abiPath = path.join(
      this.repoRoot(),
      "shared",
      "contract-metadata",
      "Ballot.abi.json"
    );
    return JSON.parse(fs.readFileSync(abiPath, "utf-8"));
  }

  private loadAddressFromShared() {
    const addressPath = path.join(
      this.repoRoot(),
      "shared",
      "contract-metadata",
      "Ballot.address.json"
    );

    const parsed = JSON.parse(fs.readFileSync(addressPath, "utf-8")) as AddressJson;
    if (!parsed.address) throw new Error("Ballot.address.json missing 'address'");
    return parsed.address;
  }

  // ----------------------------
  // Chairperson actions
  // ----------------------------

  async registerVoter(voterAddress: string) {
    // Basic address validation
    if (!ethers.isAddress(voterAddress)) {
      throw new Error("Invalid voter address");
    }

    const tx = await this.contract.register(voterAddress);
    const receipt = await tx.wait(1);

    return {
      ok: true,
      action: "register",
      voter: voterAddress,
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber ?? null,
    };
  }

  async finalize() {
    const tx = await this.contract.finalize();
    const receipt = await tx.wait(1);

    return {
      ok: true,
      action: "finalize",
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber ?? null,
    };
  }

  async getChairpersonAddress() {
    return this.signer.getAddress();
  }
}
