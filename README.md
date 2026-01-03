# 🗳️ Ballot dApp — On-chain Voting with Off-chain Indexing

## Overview

This project implements a complete Web3 voting application built on Ethereum, combining **on-chain smart contract logic** with a **traditional backend and database** to deliver a robust, scalable, and performant system.

The blockchain remains the **source of truth** for voting rules and state, while an off-chain backend indexes events into a relational database to provide fast reads, analytics, and a clean API surface.

The architecture follows a clear separation of concerns:

* **Smart contract** → correctness, transparency, immutability
* **Backend indexer** → synchronization and persistence
* **Database** → fast queries and aggregation
* **API layer** → frontend-friendly access

---

## Architecture Summary

```
Smart Contract (Sepolia)
        ↓ emits events
Indexer Service (NestJS)
        ↓
PostgreSQL (Read Model)
        ↓
REST APIs (NestJS)
        ↓
Frontend (Next.js + MetaMask) [coming next]
```

---

## Smart Contract

### Ballot Contract

The `Ballot` smart contract manages the full voting lifecycle on-chain.

**Key features:**

* Explicit voting stages (`Init → Reg → Vote → Done`)
* Time-based stage progression with optional manual override
* Voter registration with weights
* Proposal-based voting
* Deterministic winner computation
* Strongly typed, index-friendly events

**On-chain source of truth:**

* Stage
* Time windows
* Vote counts
* Winner

All state transitions emit events to enable off-chain indexing.

---

## Backend

The backend is implemented with **NestJS** and exposes REST APIs for both on-chain reads and off-chain analytics.

### Modules Overview

#### Ballot Module (On-chain Reads)

* Reads data directly from the smart contract via `ethers.js`
* Provides authoritative views of:

  * Current stage and timings
  * Proposals and vote counts
  * Winner (when finalized)

Endpoints:

```
GET /ballot/state
GET /ballot/proposals
GET /ballot/winner
```

---

#### Indexer Module (Blockchain → Database)

* Connects to Sepolia via JSON-RPC
* Fetches logs in small block ranges (RPC-safe)
* Persists:

  * Raw events (audit trail)
  * Synchronization cursor (last indexed block)
* Supports restart-safe catch-up indexing
* Optional polling to keep the database in sync without restarting

Debug endpoints:

```
GET /events
GET /sync
```

---

#### Stats Module (Off-chain Analytics)

* Reads from PostgreSQL only
* Computes aggregated metrics:

  * Total voters
  * Total votes
  * Participation rate
  * Proposal results
  * Winner status
* Optimized for frontend consumption

Endpoint:

```
GET /stats
```

---

## Database

The database uses **PostgreSQL 15** with **Prisma v7**.

### Data Model Highlights

* `OnChainEvent`

  * Immutable audit log of blockchain events
* `ContractSyncState`

  * Persistent indexing cursor
* `ballotSnapshot`

  * Aggregated contract state
* `proposal`

  * Cached proposal results

This design enables:

* Fast queries
* Deterministic rebuilds
* Clear separation between raw data and projections

---

## Project Structure (Monorepo)

```
ballot-dapp/
│
├── contracts/          # Solidity contracts & Hardhat scripts
│
├── backend/            # NestJS backend
│   ├── src/
│   │   ├── ballot/     # On-chain reads
│   │   ├── indexer/    # Event indexing
│   │   ├── stats/      # Analytics
│   │   ├── prisma/    # Database access
│
├── shared/
│   └── contract-metadata/
│       ├── Ballot.abi.json
│       └── Ballot.address.json
│
└── frontend/           # Next.js frontend (coming next)
```

---

## Environment Variables

### Backend

```
SEPOLIA_RPC_URL=
DATABASE_URL=
BALLOT_ADDRESS=
CHAIN_ID=11155111
DEPLOYMENT_BLOCK=
```

### Smart Contracts

```
SEPOLIA_RPC_URL=
DEPLOYER_PRIVATE_KEY=
```

---

## Key Design Principles

* **Blockchain as source of truth**
* **Off-chain indexing for performance**
* **Idempotent and restart-safe indexing**
* **Clear separation of responsibilities**
* **Production-minded tradeoffs (RPC limits, polling, batching)**

---

## Roadmap

* [x] Smart contract with full voting lifecycle
* [x] Backend indexing & analytics
* [x] REST API layer
* [ ] Frontend (Next.js + MetaMask)
* [ ] UI-driven voting and results visualization
* [ ] Access control and UX improvements

---

## Summary

This project demonstrates how to build a **complete Web3 application** by combining:

* deterministic on-chain logic
* reliable off-chain infrastructure
* traditional backend patterns
* modern API design

The result is a system that is transparent, scalable, and performant while remaining easy to reason about and extend.