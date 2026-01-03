// NestJS decorator used to define a module
import { Module } from "@nestjs/common";

// Service responsible for indexing on-chain events
import { IndexerService } from "./indexer.service";

// Controller exposing debugging endpoints (/events, /sync)
import { IndexerController } from "./indexer.controller";

/**
 * IndexerModule is responsible for blockchain indexing.
 *
 * Responsibilities:
 * - listen to the Ballot smart contract events
 * - synchronize on-chain data into PostgreSQL
 * - expose debug endpoints to inspect indexed data
 *
 * This module:
 * - reads from the blockchain
 * - writes to the database
 * - does NOT expose business APIs for the frontend
 */
@Module({
  // Providers contain the indexing logic
  providers: [IndexerService],

  // Controllers expose debug/inspection endpoints
  controllers: [IndexerController],
})
export class IndexerModule {}
