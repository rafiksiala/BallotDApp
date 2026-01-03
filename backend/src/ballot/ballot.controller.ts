// NestJS decorators to define HTTP controllers and routes
import { Controller, Get } from "@nestjs/common";

// BallotService is responsible for reading data from the smart contract
import { BallotService } from "./ballot.service";

/**
 * BallotController exposes REST endpoints under the `/ballot` prefix.
 *
 * Its role is very thin:
 * - it does not contain business logic
 * - it simply delegates read operations to BallotService
 *
 * This separation keeps the controller simple and testable.
 */
@Controller("ballot")
export class BallotController {
  // BallotService is injected via NestJS dependency injection
  constructor(private readonly ballot: BallotService) {}

  /**
   * GET /ballot/state
   *
   * Returns the global on-chain state of the ballot:
   * - current stage
   * - registration and voting time windows
   * - total voters and votes
   * - winner status
   *
   * This endpoint reads directly from the smart contract
   * and represents the source of truth.
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
}
