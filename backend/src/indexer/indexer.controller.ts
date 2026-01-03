// NestJS decorators for controllers and HTTP routing
import { Controller, Get, Query } from "@nestjs/common";

// PrismaService provides access to indexed on-chain data
import { PrismaService } from "../prisma/prisma.service";

/**
 * IndexerController exposes low-level inspection endpoints.
 *
 * These endpoints are mainly intended for:
 * - debugging
 * - development
 * - verifying indexer correctness
 *
 * They are NOT meant for frontend consumption in production.
 */
@Controller()
export class IndexerController {
  // PrismaService is injected to read indexed blockchain data
  constructor(private prisma: PrismaService) {}

  /**
   * GET /events
   *
   * Returns the most recent indexed on-chain events.
   * This allows verifying that the indexer is working correctly.
   *
   * Query params:
   * - limit (optional): number of events to return (default 50, max 200)
   */
  @Get("events")
  async events(@Query("limit") limit = "50") {
    // Clamp the limit to avoid heavy queries
    const n = Math.min(Number(limit) || 50, 200);

    return this.prisma.onChainEvent.findMany({
      // Most recent events first
      orderBy: [{ blockNumber: "desc" }, { logIndex: "desc" }],
      take: n,
    });
  }

  /**
   * GET /sync
   *
   * Returns the current synchronization state of indexed contracts.
   * Useful to check:
   * - last processed block
   * - whether indexing is up-to-date
   */
  @Get("sync")
  async sync() {
    const rows = await this.prisma.contractSyncState.findMany({
      orderBy: { updatedAt: "desc" },
      take: 10,
    });

    return rows;
  }
}
