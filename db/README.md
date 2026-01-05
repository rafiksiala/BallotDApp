# 🗄️ Database — Ballot dApp (PostgreSQL)

## Overview

This directory contains the **database layer** of the Ballot dApp.

The database is used as an **off-chain read model** populated by the backend indexer.
It stores indexed blockchain events and aggregated voting data to enable:

* fast analytics
* efficient API responses
* restart-safe indexing

⚠️ The database is **not a source of truth**.
The blockchain remains the only authoritative source.

---

## Responsibilities

The database is responsible for:

* Persisting indexed blockchain events
* Storing synchronization state (last indexed block)
* Holding aggregated ballot snapshots
* Supporting analytics queries for the API

The database **never**:

* signs transactions
* applies voting rules
* mutates on-chain logic

---

## Technology

* **PostgreSQL 15**
* **Docker**
* **Docker Compose**
* Persistent named volumes

---

## Files

```
db/
└── docker-compose.yml
```

There is intentionally **only one file** in this folder.

All schema definitions, migrations, and queries are handled by **Prisma in the backend**.

---

## docker-compose.yml

The database is defined as a single PostgreSQL service:

```yaml
services:
  postgres:
    image: postgres:15
    container_name: ballot_postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ballot
      POSTGRES_PASSWORD: ballot
      POSTGRES_DB: ballotdb
    ports:
      - "5433:5432"
    volumes:
      - ballot_pgdata:/var/lib/postgresql/data

volumes:
  ballot_pgdata:
```

---

## Port Mapping

| Component              | Port |
| ---------------------- | ---- |
| PostgreSQL (container) | 5432 |
| PostgreSQL (host)      | 5433 |

The backend connects via:

```
localhost:5433
```

---

## Startup Instructions

### 1) Start the database

From repository root:

```bash
docker compose up -d
```

---

### 2) Verify container

```bash
docker ps
```

You should see:

```
ballot_postgres
```

---

### 3) Verify database access (optional)

```bash
psql -h localhost -p 5433 -U ballot -d ballotdb
```

Password:

```
ballot
```

---

## Backend Connection

The backend connects using this environment variable:

```env
DATABASE_URL=postgresql://ballot:ballot@localhost:5433/ballotdb
```

All schema creation and migrations are executed by Prisma from the backend.

---

## Data Persistence

The named volume:

```
ballot_pgdata
```

ensures that:

* data survives container restarts
* indexing progress is preserved
* development sessions are stable

---

## Resetting the Database (Development)

⚠️ This will **delete all indexed data**.

```bash
docker compose down -v
docker compose up -d
```

After reset, the backend indexer will **rebuild state from the blockchain**.

---

## Design Notes

* Database is append-only via indexer
* No direct writes from frontend
* No business logic in SQL
* All data is reconstructible from chain events

---

## Summary

This database setup provides:

* a reliable persistence layer
* fast analytics for the frontend
* safe recovery after crashes
* clean separation from blockchain logic

It complements the on-chain contract without duplicating authority.
