// NestJS lifecycle interfaces
import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";

// Prisma base client
import { PrismaClient } from "@prisma/client";

// PostgreSQL adapter for Prisma v7+
import { PrismaPg } from "@prisma/adapter-pg";

// Native PostgreSQL connection pool
import { Pool } from "pg";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy {

  constructor() {
    /**
     * Create a PostgreSQL connection pool.
     * This pool is reused by Prisma through the PrismaPg adapter.
     *
     * Using a pool is important for:
     * - performance
     * - connection reuse
     * - avoiding too many open connections
     */
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    /**
     * Initialize PrismaClient with the PostgreSQL adapter.
     *
     * This is the recommended setup for Prisma v7 when using PostgreSQL.
     * Prisma will delegate low-level connection handling to the pg Pool.
     */
    super({
      adapter: new PrismaPg(pool),
    });
  }

  /**
   * Called automatically by NestJS when the module is initialized.
   * Ensures the database connection is established before handling requests.
   */
  async onModuleInit() {
    await this.$connect();
  }

  /**
   * Called automatically by NestJS during application shutdown.
   * Ensures database connections are closed cleanly.
   */
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
