// NestJS decorator used to define a module
import { Module } from "@nestjs/common";

// Service responsible for reading on-chain ballot data
import { BallotService } from "./ballot.service";

// Controller exposing REST endpoints under /ballot
import { BallotController } from "./ballot.controller";

/**
 * BallotModule groups everything related to reading
 * the Ballot smart contract state.
 *
 * Responsibilities:
 * - provide BallotService for on-chain reads
 * - expose HTTP endpoints via BallotController
 *
 * This module is intentionally read-only:
 * - no transactions
 * - no private keys
 * - no signer
 *
 * It can be reused by other modules (e.g. StatsModule)
 * by exporting BallotService.
 */
@Module({
  // Providers contain business logic and external integrations
  providers: [BallotService],

  // Controllers define the HTTP API surface
  controllers: [BallotController],

  // Export BallotService so other modules can inject it
  exports: [BallotService],
})
export class BallotModule {}
