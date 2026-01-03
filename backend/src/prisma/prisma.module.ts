// NestJS decorators
import { Global, Module } from "@nestjs/common";

// PrismaService provides database access via Prisma Client
import { PrismaService } from "./prisma.service";

/**
 * PrismaModule is declared as a global module.
 *
 * This means:
 * - PrismaService is available application-wide
 * - No need to import PrismaModule in every feature module
 *
 * It acts as the single entry point for database access.
 */
@Global()
@Module({
  // Register PrismaService as a provider
  providers: [PrismaService],

  // Export PrismaService so it can be injected anywhere
  exports: [PrismaService],
})
export class PrismaModule {}
