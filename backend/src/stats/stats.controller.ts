// NestJS decorators for defining controllers, routes and query parameters
import { Controller, Get, Query } from "@nestjs/common";

// StatsService contains the business logic to compute aggregated stats
// from the database read model
import { StatsService } from "./stats.service";

/**
 * StatsController exposes analytics endpoints under the `/stats` route.
 *
 * Unlike BallotController (which reads directly from the blockchain),
 * this controller serves data computed from the database read model.
 *
 * This allows:
 * - fast responses
 * - aggregation (participation rate, totals, winner)
 * - frontend-friendly payloads
 */
@Controller("stats")
export class StatsController {
  // StatsService is injected via NestJS dependency injection
  constructor(private readonly stats: StatsService) {}

  /**
   * GET /stats
   *
   * Optional query parameters:
   * - chainId: blockchain network id (defaults to env or Sepolia)
   * - contract: ballot contract address (defaults to env)
   *
   * Example:
   *   /stats
   *   /stats?contract=0x123...
   *   /stats?chainId=11155111&contract=0x123...
   *
   * This endpoint returns aggregated statistics built
   * from the indexed on-chain events stored in PostgreSQL.
   */
  @Get()
  async get(
    @Query("chainId") chainIdStr?: string,
    @Query("contract") contract?: string
  ) {
    // Resolve chainId with a safe fallback strategy
    const chainId = Number(chainIdStr || process.env.CHAIN_ID || "11155111");

    // Resolve contract address from query param or environment
    const contractAddress = (contract || process.env.BALLOT_ADDRESS || "").trim();

    // Defensive check to avoid ambiguous queries
    if (!contractAddress) {
      throw new Error(
        "Missing contract address. Provide ?contract=0x... or set BALLOT_ADDRESS in backend/.env"
      );
    }

    // Delegate the computation to StatsService
    return this.stats.getStats(chainId, contractAddress);
  }
}
