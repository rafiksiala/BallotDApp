// src/ballot/ballot.controller.ts
// NestJS decorators to define HTTP controllers and routes
import { Body, Controller, Get, Post } from "@nestjs/common";

// BallotService is responsible for read-only access to on-chain contract state
import { BallotService } from "./ballot.service";

// BallotWriter is responsible for chairperson-only on-chain actions (server-signed)
import { BallotWriter } from "./ballot.writer";

/**
 * BallotController exposes REST endpoints under the `/ballot` prefix.
 *
 * Design goals:
 * - Keep controllers thin (no business logic).
 * - Delegate on-chain reads to BallotService (source of truth).
 * - Delegate chairperson actions to BallotWriter (server-signed transactions).
 *
 * This separation keeps code:
 * - easier to test
 * - easier to reason about
 * - aligned with common backend architecture patterns
 */
@Controller("ballot")
export class BallotController {
  // Services are injected via NestJS dependency injection
  constructor(
    private readonly ballot: BallotService,
    private readonly writer: BallotWriter
  ) {}

  // ----------------------------
  // Read endpoints (source of truth: blockchain)
  // ----------------------------

  /**
   * GET /ballot/state
   *
   * Returns the global on-chain state of the ballot:
   * - current stage
   * - registration and voting time windows
   * - total voters and votes
   * - winner status
   *
   * This endpoint reads directly from the smart contract.
   */
  @Get("state")
  async state() {
    return this.ballot.getState();
  }

  /**
   * GET /ballot/proposals
   *
   * Returns the list of proposals with their current vote counts.
   * This is a pure read-only on-chain query.
   */
  @Get("proposals")
  async proposals() {
    return this.ballot.getProposals();
  }

  /**
   * GET /ballot/winner
   *
   * Returns the winning proposal if the ballot has been finalized.
   * If not finalized yet, returns an explicit message.
   */
  @Get("winner")
  async winner() {
    return this.ballot.getWinner();
  }

  // ----------------------------
  // Chairperson identity
  // ----------------------------

  /**
   * GET /ballot/chairperson
   *
   * Returns the address of the backend signer used for chairperson actions.
   *
   * The frontend uses this to decide whether to show/enable admin actions.
   * Note: This returns the signer address, not the private key.
   */
  @Get("chairperson")
  async chairperson() {
    const chairperson = await this.writer.getChairpersonAddress();
    return { chairperson };
  }

  // ----------------------------
  // Chairperson actions (server-signed)
  // ----------------------------

  /**
   * POST /ballot/register
   *
   * Registers a voter on-chain (chairperson-only).
   *
   * Payload:
   * {
   *   "voterAddress": "0x..."
   * }
   *
   * The transaction is signed by the backend signer (BallotWriter),
   * so the connected wallet in the UI does NOT sign this operation.
   */
  @Post("register")
  async register(@Body() body: { voterAddress: string }) {
    return this.writer.registerVoter(body.voterAddress);
  }

  /**
   * POST /ballot/finalize
   *
   * Finalizes the ballot on-chain (chairperson-only).
   *
   * The transaction is signed by the backend signer (BallotWriter).
   * The frontend just triggers it.
   */
  @Post("finalize")
  async finalize() {
    return this.writer.finalize();
  }
}
