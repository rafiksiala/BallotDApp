// src/indexer/indexer.service.ts
// Notes:
// - This service indexes on-chain events from the Ballot contract on Sepolia into PostgreSQL.
// - It supports a "catch-up" mode that backfills logs in small block ranges to respect free-tier RPC limits.
// - It stores raw events (audit-friendly) + a sync cursor (last processed block) so it can resume safely.
// - It also projects events into a DB read model (snapshot/voters/votes/proposals) for fast /stats queries.

import { Injectable, OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ethers } from "ethers";
import fs from "fs";
import path from "path";

type AddressJson = { address: string; network?: string };

@Injectable()
export class IndexerService implements OnModuleInit {
  // Ethers provider + contract instance (read-only)
  private provider!: ethers.JsonRpcProvider;
  private contract!: ethers.Contract;

  // Network / contract identity
  private readonly chainId = Number(process.env.CHAIN_ID || "11155111"); // Sepolia by default
  private contractAddress!: string;

  // RPC limitations & safety knobs
  private readonly MAX_LOG_BLOCK_RANGE = 10;

  // Optional confirmations to reduce the chance of indexing blocks that might be reorged
  private readonly CONFIRMATIONS = 2;

  constructor(private readonly prisma: PrismaService) { }

  async onModuleInit() {
    await this.initProviderAndContract();

    // Quick sanity check: prove we can read on-chain state
    const stage = await this.contract.currentStage();
    console.log("🗳️ Ballot currentStage (on-chain):", stage.toString());

    // Backfill events from the last cursor to the latest safe block
    await this.catchUpOnce();

    // Poll every 15 seconds
    setInterval(async () => {
      try {
        await this.catchUpOnce();
      } catch (e) {
        console.error("Indexer polling failed:", e);
      }
    }, 15_000);

    // (Optional) Enable live indexing after catch-up (not enabled by default here).
    // await this.startLiveListener();
  }

  // ----------------------------
  // Initialization
  // ----------------------------

  private async initProviderAndContract() {
    const rpc = process.env.SEPOLIA_RPC_URL;
    if (!rpc) {
      throw new Error("Missing SEPOLIA_RPC_URL in backend/.env");
    }

    this.provider = new ethers.JsonRpcProvider(rpc);

    // Prefer env var for address, fallback to shared JSON file
    this.contractAddress =
      process.env.BALLOT_ADDRESS?.trim() || this.loadAddressFromShared();

    // ABI always comes from shared JSON file
    const abi = this.loadAbiFromShared();

    // Read-only contract (provider only, no signer)
    this.contract = new ethers.Contract(this.contractAddress, abi, this.provider);

    console.log("🔗 Indexer connected:", {
      chainId: this.chainId,
      contract: this.contractAddress,
    });
  }

  // Resolve monorepo root: when running in backend/, process.cwd() = ballot-dapp/backend
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

    const parsed = JSON.parse(
      fs.readFileSync(addressPath, "utf-8")
    ) as AddressJson;

    if (!parsed.address) {
      throw new Error("Ballot.address.json is missing the 'address' field");
    }

    return parsed.address;
  }

  // ----------------------------
  // Sync state (cursor)
  // ----------------------------

  private async getOrCreateSyncState() {
    // Start strategy:
    // - If a deployment block is provided, start from there (best practice).
    // - Otherwise, start near the chain tip to keep the first run fast.
    const latest = await this.provider.getBlockNumber();
    const deploymentBlock = Number(process.env.DEPLOYMENT_BLOCK || "0");

    const defaultStart =
      deploymentBlock > 0
        ? Math.max(deploymentBlock - 1, 0)
        : Math.max(latest - 100, 0);

    const state = await this.prisma.contractSyncState.upsert({
      where: {
        chainId_contractAddress: {
          chainId: this.chainId,
          contractAddress: this.contractAddress.toLowerCase(),
        },
      },
      update: {},
      create: {
        chainId: this.chainId,
        contractAddress: this.contractAddress.toLowerCase(),
        lastProcessedBlock: defaultStart,
      },
    });

    return state;
  }

  // ----------------------------
  // Catch-up indexing (backfill)
  // ----------------------------

  private async catchUpOnce() {
    const state = await this.getOrCreateSyncState();

    const latest = await this.provider.getBlockNumber();
    const safeLatest = Math.max(latest - this.CONFIRMATIONS, 0);

    const fromBlockInitial = state.lastProcessedBlock + 1;

    if (fromBlockInitial > safeLatest) {
      console.log("✅ No new blocks to index.", { latest, safeLatest });
      return;
    }

    console.log(
      `📦 Catch-up indexing blocks ${fromBlockInitial} -> ${safeLatest} (batch=${this.MAX_LOG_BLOCK_RANGE})`
    );

    let insertedTotal = 0;
    let fromBlock = fromBlockInitial;

    while (fromBlock <= safeLatest) {
      const toBlock = Math.min(
        fromBlock + this.MAX_LOG_BLOCK_RANGE - 1,
        safeLatest
      );

      let logs: Array<ethers.Log | ethers.EventLog> = [];
      try {
        logs = await this.contract.queryFilter("*", fromBlock, toBlock);
      } catch (e: any) {
        console.error(
          `❌ getLogs failed for range ${fromBlock} -> ${toBlock}`,
          e?.shortMessage || e
        );
        throw e;
      }

      if (logs.length > 0) {
        console.log(`🧾 Range ${fromBlock} -> ${toBlock}: ${logs.length} logs`);
      }

      let inserted = 0;

      for (const ev of logs) {
        const { eventName, argsJson } = this.decodeLog(ev);

        // 1) Store raw event (audit trail)
        let created = false;
        try {
          await this.prisma.onChainEvent.create({
            data: {
              chainId: this.chainId,
              contractAddress: this.contractAddress.toLowerCase(),
              blockNumber: ev.blockNumber,
              blockHash: ev.blockHash,
              txHash: ev.transactionHash,
              logIndex: ev.index,
              eventName,
              argsJson,
            },
          });
          created = true;
          inserted += 1;
        } catch (e: any) {
          // Ignore duplicates (unique constraint violation)
          if (e?.code !== "P2002") {
            console.error("❌ Failed inserting event:", e);
            throw e;
          }
        }

        // 2) Project into read model only if this event is new (avoid double increments)
        if (created) {
          await this.applyReadModelProjection(
            eventName,
            argsJson as any,
            ev.blockNumber,
            ev.transactionHash
          );
        }
      }

      insertedTotal += inserted;

      // Update cursor progressively (important for crash-safety mid-backfill)
      await this.prisma.contractSyncState.update({
        where: {
          chainId_contractAddress: {
            chainId: this.chainId,
            contractAddress: this.contractAddress.toLowerCase(),
          },
        },
        data: { lastProcessedBlock: toBlock },
      });

      fromBlock = toBlock + 1;
    }

    console.log(`✅ Catch-up done. Inserted ${insertedTotal} new events.`);
  }

  // ----------------------------
  // Decoding helpers
  // ----------------------------

  private decodeLog(ev: ethers.Log | ethers.EventLog): {
    eventName: string;
    argsJson: Record<string, any>;
  } {
    // If it's an EventLog, ethers already decoded it (fragment + args available)
    if ("fragment" in ev && "args" in ev) {
      const eventName = ev.fragment?.name || "UnknownEvent";
      const argsJson: Record<string, any> = {};
      const positional: any[] = [];

      if (ev.args) {
        for (const [k, v] of Object.entries(ev.args)) {
          const val = typeof v === "bigint" ? v.toString() : v;

          // Keep positional args (0,1,2,...) in a dedicated array
          if (!Number.isNaN(Number(k))) {
            positional[Number(k)] = val;
            continue;
          }

          // Keep named args when available
          argsJson[k] = val;
        }
      }

      // Attach positional args if we have any
      if (positional.length > 0) {
        argsJson.__positional = positional;
      }

      return { eventName, argsJson };
    }

    // Otherwise it's a raw Log; decode via contract interface
    try {
      const parsed = this.contract.interface.parseLog({
        topics: ev.topics,
        data: ev.data,
      });

      if (!parsed) {
        return { eventName: "UnknownEvent", argsJson: {} };
      }

      const argsJson: Record<string, any> = {};
      const positional: any[] = [];

      for (const [k, v] of Object.entries(parsed.args)) {
        const val = typeof v === "bigint" ? v.toString() : v;

        // Keep positional args (0,1,2,...) in a dedicated array
        if (!Number.isNaN(Number(k))) {
          positional[Number(k)] = val;
          continue;
        }

        // Keep named args when available
        argsJson[k] = val;
      }

      // Attach positional args if we have any
      if (positional.length > 0) {
        argsJson.__positional = positional;
      }

      return { eventName: parsed.name || "UnknownEvent", argsJson };
    } catch {
      return { eventName: "UnknownEvent", argsJson: {} };
    }
  }

  private getArg(argsJson: any, name: string, pos: number) {
    // Prefer named args
    if (argsJson && typeof argsJson === "object" && argsJson[name] !== undefined) {
      return argsJson[name];
    }

    // Fallback to positional args
    const positional = argsJson?.__positional;
    if (Array.isArray(positional) && positional[pos] !== undefined) {
      return positional[pos];
    }

    return undefined;
  }

  // ----------------------------
  // Read model projection (DB cache for fast stats)
  // ----------------------------

  private async applyReadModelProjection(
    eventName: string,
    argsJson: Record<string, any>,
    blockNumber: number,
    txHash: string
  ) {
    const chainId = this.chainId;
    const contractAddress = this.contractAddress.toLowerCase();

    // Ensure snapshot exists
    await this.prisma.ballotSnapshot.upsert({
      where: { chainId_contractAddress: { chainId, contractAddress } },
      update: { lastIndexedBlock: blockNumber },
      create: {
        chainId,
        contractAddress,
        lastIndexedBlock: blockNumber,
        stage: 0,
        totalVoters: 0,
        totalVotes: 0,
        winnerComputed: false,
        winningProposalId: 0,
      },
    });

    if (eventName === "StageChanged") {
      const newStageRaw = this.getArg(argsJson, "newStage", 0);
      const newStage = Number(newStageRaw);

      if (Number.isFinite(newStage)) {
        await this.prisma.ballotSnapshot.update({
          where: { chainId_contractAddress: { chainId, contractAddress } },
          data: { stage: newStage },
        });
      }

      return;
    }

    if (eventName === "VoterRegistered") {
      const voter = this.getArg(argsJson, "voter", 0) as string;
      const weightRaw = this.getArg(argsJson, "weight", 1);
      const weight = Number(weightRaw ?? 1);

      if (voter) {
        await this.prisma.voter.upsert({
          where: {
            chainId_contractAddress_voterAddress: {
              chainId,
              contractAddress,
              voterAddress: voter.toLowerCase(),
            },
          },
          update: {
            weight,
            registeredAtBlock: blockNumber,
            lastUpdatedBlock: blockNumber,
          },
          create: {
            chainId,
            contractAddress,
            voterAddress: voter.toLowerCase(),
            weight,
            hasVoted: false,
            registeredAtBlock: blockNumber,
            lastUpdatedBlock: blockNumber,
          },
        });

        // Increment totalVoters only when a voter is newly created is more correct,
        // but for simplicity we increment on each new VoterRegistered event.
        await this.prisma.ballotSnapshot.update({
          where: { chainId_contractAddress: { chainId, contractAddress } },
          data: { totalVoters: { increment: 1 } },
        });
      }

      return;
    }

    if (eventName === "VoteCast") {
      const voter = this.getArg(argsJson, "voter", 0) as string;
      const proposalIdRaw = this.getArg(argsJson, "proposalId", 1);
      const weightRaw = this.getArg(argsJson, "weight", 2);

      const proposalId = Number(proposalIdRaw);
      const weight = Number(weightRaw);

      if (voter !== undefined && Number.isFinite(proposalId)) {
        // Store one vote per voter (unique constraint)
        await this.prisma.vote.upsert({
          where: {
            chainId_contractAddress_voterAddress: {
              chainId,
              contractAddress,
              voterAddress: voter.toLowerCase(),
            },
          },
          update: {
            proposalId,
            weight,
            txHash,
            blockNumber,
          },
          create: {
            chainId,
            contractAddress,
            voterAddress: voter.toLowerCase(),
            proposalId,
            weight,
            txHash,
            blockNumber,
          },
        });

        // Mark voter as voted
        await this.prisma.voter.upsert({
          where: {
            chainId_contractAddress_voterAddress: {
              chainId,
              contractAddress,
              voterAddress: voter.toLowerCase(),
            },
          },
          update: {
            hasVoted: true,
            lastUpdatedBlock: blockNumber,
          },
          create: {
            chainId,
            contractAddress,
            voterAddress: voter.toLowerCase(),
            weight: Number.isFinite(weight) ? weight : 1,
            hasVoted: true,
            registeredAtBlock: null,
            lastUpdatedBlock: blockNumber,
          },
        });

        // Update proposal cached voteCount (string arithmetic)
        const existing = await this.prisma.proposal.findUnique({
          where: {
            chainId_contractAddress_proposalId: {
              chainId,
              contractAddress,
              proposalId,
            },
          },
        });

        const current = existing ? Number(existing.voteCount) : 0;
        const next = current + (Number.isFinite(weight) ? weight : 0);

        await this.prisma.proposal.upsert({
          where: {
            chainId_contractAddress_proposalId: {
              chainId,
              contractAddress,
              proposalId,
            },
          },
          update: { voteCount: String(next) },
          create: {
            chainId,
            contractAddress,
            proposalId,
            name: `proposal-${proposalId}`,
            voteCount: String(next),
          },
        });

        // Snapshot totalVotes increments by 1 vote (not sum of weights)
        await this.prisma.ballotSnapshot.update({
          where: { chainId_contractAddress: { chainId, contractAddress } },
          data: { totalVotes: { increment: 1 } },
        });
      }

      return;
    }

    if (eventName === "Finalized") {
      const winningProposalIdRaw = this.getArg(argsJson, "winningProposalId", 0);
      const winningProposalId = Number(winningProposalIdRaw);

      if (Number.isFinite(winningProposalId)) {
        await this.prisma.ballotSnapshot.update({
          where: { chainId_contractAddress: { chainId, contractAddress } },
          data: {
            winnerComputed: true,
            winningProposalId,
          },
        });
      }

      return;
    }
  }

  // ----------------------------
  // (Optional) Live listener (not enabled yet)
  // ----------------------------
  // private async startLiveListener() {
  //   console.log("📡 Live listener started (contract.on)");
  //
  //   this.contract.on("*", async (...args: any[]) => {
  //     const ev = args[args.length - 1]; // EventLog
  //     const { eventName, argsJson } = this.decodeLog(ev);
  //
  //     let created = false;
  //     try {
  //       await this.prisma.onChainEvent.create({
  //         data: {
  //           chainId: this.chainId,
  //           contractAddress: this.contractAddress.toLowerCase(),
  //           blockNumber: ev.blockNumber,
  //           blockHash: ev.blockHash,
  //           txHash: ev.transactionHash,
  //           logIndex: ev.index,
  //           eventName,
  //           argsJson,
  //         },
  //       });
  //       created = true;
  //     } catch (e: any) {
  //       if (e?.code !== "P2002") throw e;
  //     }
  //
  //     if (created) {
  //       await this.applyReadModelProjection(
  //         eventName,
  //         argsJson as any,
  //         ev.blockNumber,
  //         ev.transactionHash
  //       );
  //     }
  //   });
  // }
}