// Injectable decorator marks this class as a NestJS service
import { Injectable } from "@nestjs/common";

// PrismaService provides access to the PostgreSQL database
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class StatsService {
  // PrismaService is injected via dependency injection
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns aggregated statistics for a given ballot contract.
   *
   * This method reads from the database read model populated by the indexer.
   * It does NOT query the blockchain directly.
   *
   * @param chainId - blockchain network id (e.g. Sepolia = 11155111)
   * @param contractAddress - ballot contract address
   */
  async getStats(chainId: number, contractAddress: string) {
    // Normalize address to lowercase for consistent DB lookups
    const addr = contractAddress.toLowerCase();

    /**
     * Fetch the latest snapshot for this contract.
     * The snapshot stores pre-aggregated values such as:
     * - current stage
     * - total voters
     * - total votes
     * - winner information
     */
    const snapshot = await this.prisma.ballotSnapshot.findUnique({
      where: { chainId_contractAddress: { chainId, contractAddress: addr } },
    });

    /**
     * Fetch cached proposals with their vote counts.
     * These values are maintained incrementally by the indexer.
     */
    const proposals = await this.prisma.proposal.findMany({
      where: { chainId, contractAddress: addr },
      orderBy: { proposalId: "asc" },
    });

    // Defensive defaults in case indexing is not complete yet
    const totalVoters = snapshot?.totalVoters ?? 0;
    const totalVotes = snapshot?.totalVotes ?? 0;

    /**
     * Participation rate is derived off-chain
     * to avoid unnecessary computation on-chain.
     */
    const participationRate =
      totalVoters > 0 ? Number((totalVotes / totalVoters).toFixed(4)) : 0;

    /**
     * Build a frontend-friendly response object.
     * This payload is optimized for UI consumption.
     */
    return {
      chainId,
      contractAddress: addr,
      stage: snapshot?.stage ?? 0,
      totalVoters,
      totalVotes,
      participationRate,
      winner: {
        computed: snapshot?.winnerComputed ?? false,
        proposalId: snapshot?.winningProposalId ?? 0,
      },
      proposals: proposals.map((p) => ({
        id: p.proposalId,
        name: p.name,
        voteCount: p.voteCount,
      })),
      lastIndexedBlock: snapshot?.lastIndexedBlock ?? 0,
    };
  }
}
