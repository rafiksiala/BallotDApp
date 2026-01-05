# 🗳️ Ballot dApp — On-chain Voting with Off-chain Indexing

## Overview

This repository contains a complete Web3 voting application built on Ethereum testnet (**Sepolia**) that combines:

- **On-chain logic (Solidity smart contract)** as the source of truth  
- **Off-chain indexing (NestJS + ethers.js)** to persist and query events efficiently  
- **Relational read model (PostgreSQL 15 + Prisma v7)** for fast reads, analytics, and projections  
- **REST API layer (NestJS)** for frontend-friendly access  
- **Frontend (Next.js + MetaMask)** for user interaction (wallet connection, voting, admin actions)

The system is designed with production-minded patterns: restart-safe indexing, idempotent event ingestion, batching to respect RPC limits, and clear separation between read-only contract queries and write transactions.

---

## Architecture

### End-to-End Data Flow

```

```
        ┌─────────────────────────────────┐
        │   Frontend (Next.js + wagmi)    │
        │   - MetaMask wallet             │
        │   - Vote / Register / Finalize  │
        └───────────────┬─────────────────┘
                        │
       (read/write)     │      (REST)
                        │
        ┌───────────────▼─────────────────┐
        │          Backend (NestJS)       │
        │                                 │
        │  BallotModule (reads)           │
        │   - Reads state from chain      │
        │   - Proposals / winner          │
        │                                 │
        │  BallotWriter (writes)          │
        │   - Sends tx for chairperson    │
        │   - Register / Finalize / etc   │
        │                                 │
        │  IndexerModule (sync)           │
        │   - Fetch logs in batches       │
        │   - Persist raw events          │
        │   - Maintain sync cursor        │
        │   - Optional polling/live       │
        │                                 │
        │  StatsModule (analytics)        │
        │   - Reads DB projections        │
        │   - Returns aggregated stats    │
        └───────────────┬─────────────────┘
                        │
                        │ (SQL via Prisma v7)
                        │
        ┌───────────────▼─────────────────┐
        │   PostgreSQL 15 (Read Model)    │
        │   - Raw event log               │
        │   - Sync cursor                 │
        │   - Snapshots / proposals       │
        └─────────────────────────────────┘

        ┌─────────────────────────────────┐
        │   Smart Contract (Sepolia)      │
        │   - Stages, windows, voting     │
        │   - Emits index-friendly events │
        └─────────────────────────────────┘
```

```

### Responsibilities (Separation of Concerns)

- **Smart contract**: correctness, transparency, deterministic rules  
- **Backend “Read” layer**: authoritative reads directly from chain  
- **Backend “Write” layer (BallotWriter)**: controlled transaction sending  
- **Indexer**: sync events from chain into DB (audit trail + cursor)  
- **Stats**: fast analytics from DB projections  
- **Frontend**: user-facing UX (wallet connect + actions)

---

## Repository Structure (Monorepo)

```

ballot-dapp/
│
├── contracts/                    # Solidity + Hardhat scripts
│   ├── contracts/                # Ballot.sol
│   ├── scripts/                  # deploy/register/vote/finalize etc.
│   ├── test/                     # Hardhat tests
│   └── hardhat.config.ts
│
├── backend/                      # NestJS backend
│   ├── prisma/                   # Prisma schema & migrations
│   ├── src/
│   │   ├── ballot/               # Read from chain (BallotService) + REST + Write transactions (register/finalize)
│   │   ├── indexer/              # Event indexing from chain → DB
│   │   ├── stats/                # DB analytics endpoints
│   │   ├── prisma/               # Prisma module/service (v7 adapter-pg)
│   │   └── main.ts               # Nest bootstrap
│   └── .env                      # Backend env (not committed)
│
├── shared/
│   └── contract-metadata/
│       ├── Ballot.abi.json
│       └── Ballot.address.json
│
└── frontend/                     # Next.js frontend
├── src/app/                  # App Router
├── src/lib/                  # API + wagmi config
└── .env.local                # Frontend env (not committed)

```

---

## Smart Contract

### Ballot Contract

The `Ballot` smart contract manages the full voting lifecycle on-chain.

**Key features:**
- Explicit lifecycle stages: `Init → Reg → Vote → Done`
- Time-window driven stage progression (deterministic)
- Chairperson-controlled voter registration (weighted)
- Proposal-based voting
- Winner computation via `finalize()`
- Index-friendly events emitted for off-chain indexing

**Source of truth on-chain:**
- Stage
- Time windows
- Vote counts per proposal
- Winner state

---

## Backend (NestJS)

The backend exposes a clean REST API and runs the indexing process that syncs blockchain events into PostgreSQL.

### Ballot Module (On-chain Reads)

**Goal:** Provide authoritative reads from the smart contract (source of truth).

Endpoints:
```

GET /ballot/state
GET /ballot/proposals
GET /ballot/winner

```

What it returns:
- current stage and timestamps
- proposal list and vote counts
- winner details (if finalized)

---

### Ballot Writer (On-chain Writes)

**Goal:** Send transactions to the contract using a signer (chairperson/deployer key).

Typical use-cases:
- register voters (chairperson only)
- finalize the ballot (access control depends on contract rules)
- optional manual stage management (if contract supports it)

> This layer exists to keep write operations isolated from read-only services.

---

### Indexer Module (Blockchain → Database)

**Goal:** Sync on-chain events into PostgreSQL with production-minded patterns:

- Fetch logs in small block ranges (RPC-safe batching)
- Persist an immutable audit trail (`OnChainEvent`)
- Maintain an indexing cursor (`ContractSyncState`)
- Restart-safe: can resume from last processed block
- Optional polling/live mode to keep DB updated continuously

Debug endpoints:
```

GET /events?limit=50
GET /sync

```

---

### Stats Module (Off-chain Analytics)

**Goal:** Provide frontend-friendly aggregated stats from PostgreSQL projections.

Endpoint:
```

GET /stats

```

Metrics:
- total voters
- total votes
- participation rate
- proposals results
- winner status
- last indexed block

---

## Database (PostgreSQL 15 + Prisma v7)

The DB is a **read model** optimized for analytics and UI reads.

### Core Tables / Models

- `OnChainEvent`
  - immutable audit log of indexed events
  - unique constraint on `(chainId, txHash, logIndex)` to prevent duplicates

- `ContractSyncState`
  - persistent cursor storing the last indexed block per `(chainId, contractAddress)`

- Projections (if enabled in your schema)
  - `ballotSnapshot` (cached contract state)
  - `proposal` (cached proposal counts)
  - plus any derived tables you add (voters/votes, etc.)

This design enables:
- fast queries
- deterministic rebuilds
- clean separation between raw data and projections

---

## Environment Variables

### Contracts (`contracts/.env`)

```

SEPOLIA_RPC_URL=
DEPLOYER_PRIVATE_KEY=
BALLOT_ADDRESS=   # optional, used by scripts

```

### Backend (`backend/.env`)

```

SEPOLIA_RPC_URL=
DATABASE_URL=
BALLOT_ADDRESS=
CHAIN_ID=11155111
DEPLOYMENT_BLOCK=

```

### Frontend (`frontend/.env.local`)

Example:
```

NEXT_PUBLIC_BACKEND_URL=[http://localhost:3000](http://localhost:3000)
NEXT_PUBLIC_CHAIN_ID=11155111

````

> Never commit any `.env*` files.

---

## How to Run (Local Development)

### 1) Smart Contracts

From `contracts/`:

```bash
npm install
npx hardhat compile
````

Deploy to Sepolia:

```bash
npx hardhat run scripts/deploy-sepolia.ts --network sepolia
```

After deploy, update:

* `shared/contract-metadata/Ballot.address.json`
* `backend/.env` `BALLOT_ADDRESS` and `DEPLOYMENT_BLOCK`
* `contracts/.env` `BALLOT_ADDRESS` (optional)

---

### 2) Database (PostgreSQL 15)

Create a Postgres database and set `DATABASE_URL` in `backend/.env`.

Example URL:

```
DATABASE_URL="postgresql://user:password@localhost:5432/ballot?schema=public"
```

Run Prisma migrations:

```bash
cd backend
npx prisma migrate dev
```

---

### 3) Backend (NestJS)

```bash
cd backend
npm install
npm run start:dev
```

Useful endpoints:

* `http://localhost:3000/events?limit=10`
* `http://localhost:3000/ballot/state`
* `http://localhost:3000/stats`

---

### 4) Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev
```

Open:

* `http://localhost:3001`

---

## Key Design Principles

* **Blockchain as source of truth**
* **Off-chain indexing for performance**
* **Restart-safe indexing via cursor**
* **Idempotent ingestion via unique constraints**
* **Read vs Write separation (BallotService vs BallotWriter)**
* **RPC-safe batching & retry/polling tradeoffs**

---

## Roadmap

* [x] Smart contract lifecycle + index-friendly events
* [x] Hardhat scripts for deploy and interactions
* [x] Backend read APIs (on-chain)
* [x] Backend indexing into PostgreSQL (cursor + batching)
* [x] Backend stats APIs (off-chain)
* [x] Frontend setup (Next.js + wagmi)
* [ ] UI polishing (layout, error UX, admin flows)
* [ ] Optional: live listener + advanced reorg handling
* [ ] Optional: deterministic rebuild from deployment block

---

## Notes

* This project uses **Sepolia only** (no mainnet).
* Test ETH can be acquired using public faucets.
* RPC providers may throttle `eth_getLogs`; indexing uses batching and should be configured with a correct `DEPLOYMENT_BLOCK`.
