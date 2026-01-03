// NestJS decorator used to define a module
import { Module } from "@nestjs/common";

// Controller exposing the /stats REST endpoint
import { StatsController } from "./stats.controller";

// Service containing the business logic for statistics computation
import { StatsService } from "./stats.service";

// PrismaModule provides access to the database (PostgreSQL)
import { PrismaModule } from "../prisma/prisma.module";

/**
 * StatsModule groups everything related to analytics and statistics.
 *
 * Responsibilities:
 * - expose aggregated ballot statistics via StatsController
 * - compute metrics using StatsService
 * - rely on PrismaModule to access the database read model
 *
 * This module does NOT interact with the blockchain directly.
 * It only reads from PostgreSQL, which is populated by the indexer.
 */
@Module({
  // Import PrismaModule to enable database access via PrismaService
  imports: [PrismaModule],

  // Controllers define the HTTP API surface
  controllers: [StatsController],

  // Providers contain the business logic
  providers: [StatsService],
})
export class StatsModule {}
