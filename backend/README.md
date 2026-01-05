# Backend — Ballot dApp (NestJS + PostgreSQL + Ethereum)

## Overview

This backend is the **off-chain infrastructure** of the Ballot dApp.

Its role is to bridge the blockchain world with a traditional backend stack by:

* reading authoritative data directly from the smart contract
* indexing on-chain events into a PostgreSQL database
* exposing clean REST APIs for frontend consumption
* providing analytics and aggregated views of the ballot

The blockchain remains the **source of truth**, while the backend enables **performance, observability, and UX**.

---

## Responsibilities

The backend is responsible for:

* 🔗 Connecting to Ethereum (Sepolia)
* 📘 Reading on-chain state (ballot, proposals, winner)
* ✍️ Writing transactions (chairperson actions)
* 📦 Indexing smart contract events
* 🗄️ Persisting data into PostgreSQL
* 📊 Computing off-chain statistics
* 🌐 Exposing REST APIs

---

## Tech Stack

* **Node.js** (>= 18)
* **NestJS** (TypeScript backend framework)
* **ethers.js v6** (Ethereum interaction)
* **PostgreSQL 15**
* **Prisma v7** (ORM)
* **dotenv** (environment configuration)

---

## Project Structure

```
backend/
│
├── src/
│   ├── ballot/           # On-chain reads + writes
│   │   ├── ballot.service.ts
│   │   ├── ballot.controller.ts
│   │   ├── ballot.writer.ts
│   │   └── ballot.module.ts
│   │
│   ├── indexer/          # Blockchain → DB synchronization
│   │   ├── indexer.service.ts
│   │   ├── indexer.controller.ts
│   │   └── indexer.module.ts
│   │
│   ├── stats/            # Off-chain analytics
│   │   ├── stats.service.ts
│   │   ├── stats.controller.ts
│   │   └── stats.module.ts
│   │
│   ├── prisma/           # Database access layer
│   │   ├── prisma.service.ts
│   │   └── prisma.module.ts
│   │
│   ├── app.module.ts
│   └── main.ts
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
├── scripts/              # Optional admin / maintenance scripts
│
├── .env                  # Environment variables (not committed)
├── package.json
└── tsconfig.json
```

---

## Backend Initialization (From Scratch)

### 1) Install NestJS CLI

```bash
npm install -g @nestjs/cli
```

Verify:

```bash
nest --version
```

---

### 2) Create the backend project

From the **repository root**:

```bash
nest new backend
```

Recommended options:

* Language: TypeScript
* Package manager: npm
* Git: No (monorepo already uses git)

---

### 3) Enter backend directory

```bash
cd backend
```

---

### 4) Install blockchain & utility dependencies

```bash
npm install ethers dotenv
```

---

### 5) Install database tooling (Prisma + PostgreSQL)

```bash
npm install prisma @prisma/client
npm install pg
npm install @prisma/adapter-pg
```

Initialize Prisma:

```bash
npx prisma init
```

---

### 6) Enable environment variables globally

Ensure `ConfigModule` is enabled in `app.module.ts`:

```ts
ConfigModule.forRoot({ isGlobal: true })
```

---

## Environment Variables

Create `backend/.env`:

```env
# Ethereum
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/XXXX
CHAIN_ID=11155111
BALLOT_ADDRESS=0xYourContractAddress
DEPLOYMENT_BLOCK=9971829

# Database
DATABASE_URL=postgresql://user:password@localhost:5433/ballot
```

---

## Database Setup

### 1) Start PostgreSQL (Docker)

From repository root:

```bash
docker compose up -d
```

---

### 2) Apply Prisma migrations

```bash
npx prisma migrate deploy
```

Optional (dev reset):

```bash
npx prisma migrate reset
```

---

## Backend Modules Explained

---

### Ballot Module — On-chain Reads

Reads **directly from the smart contract**.

Responsibilities:

* Current stage & timings
* Proposals & vote counts
* Winner (when finalized)

Endpoints:

```
GET /ballot/state
GET /ballot/proposals
GET /ballot/winner
```

This module represents the **authoritative on-chain view**.

---

### Ballot Writer — On-chain Writes

Handles **transactional operations**, restricted to the chairperson.

Responsibilities:

* Register voters
* Open / close registration
* Open voting
* Finalize ballot
* Enable / disable manual mode

This separation avoids mixing reads and writes.

---

### Indexer Module — Blockchain → Database

Continuously synchronizes blockchain events.

Responsibilities:

* Fetch logs in small, RPC-safe batches
* Persist raw events
* Maintain last indexed block
* Support restart-safe indexing
* Optional polling mode (no restart needed)

Debug endpoints:

```
GET /events
GET /sync
```

---

### Stats Module — Off-chain Analytics

Reads **only from PostgreSQL**.

Computes:

* Total voters
* Total votes
* Participation rate
* Proposal results
* Winner status

Endpoint:

```
GET /stats
```

This module is optimized for frontend performance.

---

### Prisma Module — Database Access

Provides:

* PostgreSQL connection pooling
* Prisma client lifecycle
* Centralized DB access

Implemented using Prisma v7 + `@prisma/adapter-pg`.

---

## Running the Backend

### Development mode (watch)

```bash
npm run start:dev
```

Backend runs on:

```
http://localhost:3000
```

---

## API Summary

### On-chain Reads

```
GET /ballot/state
GET /ballot/proposals
GET /ballot/winner
```

### Analytics

```
GET /stats
```

### Debug / Indexer

```
GET /events
GET /sync
```

---

## Key Design Decisions

* Blockchain is the **source of truth**
* Backend never mutates voting results
* Events drive state reconstruction
* Indexer is idempotent & restart-safe
* Reads and writes are separated
* Database is a **read model**, not authority

---

## Common Pitfalls

* RPC rate limits → handled via small batch indexing
* Restarting backend without losing state → cursor stored in DB
* SSR / frontend performance → solved via `/stats` endpoint

---

## Summary

This backend demonstrates how to build a **production-grade Web3 backend** by combining:

* deterministic on-chain logic
* robust off-chain indexing
* traditional backend architecture
* clean REST APIs

It is designed to be:

* understandable
* restart-safe
* scalable
* extensible

