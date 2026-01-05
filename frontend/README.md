# 🌐 Frontend — Ballot dApp (Next.js + wagmi v2)

## Overview

This frontend is the **user-facing interface** of the Ballot dApp.

It allows users to:

* connect their Ethereum wallet (MetaMask)
* view the current ballot state
* browse proposals and live vote counts
* vote on proposals (registered voters only)
* observe winner results once finalized
* interact with the system safely and transparently

The frontend **never computes voting logic**.
It relies on:

* **on-chain reads** (via backend APIs)
* **on-chain writes** (via wallet + smart contract)
* **off-chain analytics** (via backend stats API)

---

## Responsibilities

The frontend is responsible for:

* 🦊 Wallet connection (MetaMask)
* 🔗 Transaction signing (client-side)
* 📡 Calling backend REST APIs
* 📊 Displaying live ballot state
* 🎛️ Enforcing UX-level permissions
* ❌ Handling revert errors cleanly

---

## Tech Stack

* **Next.js (App Router)**
* **React**
* **TypeScript**
* **wagmi v2**
* **viem**
* **MetaMask**
* **Fetch API**
* **CSS / basic UI components**

---

## Project Structure

```
frontend/
│
├── src/
│   ├── app/
│   │   ├── page.tsx        # Main ballot UI
│   │   ├── layout.tsx
│   │
│   ├── lib/
│   │   ├── wagmi.ts        # wagmi + chain config
│   │   ├── api.ts          # backend API helpers
│   │   └── contract.ts     # contract ABI + helpers
│   │
│   ├── components/
│   │   ├── ConnectButton.tsx
│   │   ├── StatusBanner.tsx
│   │   ├── ProposalCard.tsx
│   │   └── ErrorBanner.tsx
│
├── public/
│
├── .env.local
├── package.json
└── tsconfig.json
```

---

## Frontend Initialization (From Scratch)

### 1) Create the Next.js project

From repository root:

```bash
npx create-next-app@latest frontend
```

Recommended options:

* TypeScript: Yes
* App Router: Yes
* Tailwind: optional
* ESLint: Yes
* src/ directory: Yes

---

### 2) Enter frontend directory

```bash
cd frontend
```

---

### 3) Install Web3 dependencies

```bash
npm install wagmi viem
```

---

### 4) Install wallet support

MetaMask is used implicitly via browser injection.

No additional package is required.

---

## Environment Variables

Create `frontend/.env.local`:

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:3000
NEXT_PUBLIC_CHAIN_ID=11155111
```

> Only `NEXT_PUBLIC_*` variables are exposed to the browser.

---

## Wallet Configuration (wagmi v2)

The wagmi setup lives in:

```
src/lib/wagmi.ts
```

Responsibilities:

* configure Sepolia chain
* setup wallet connectors
* expose WagmiProvider config

The frontend uses **wagmi v2 APIs** (`useAccount`, `useConnect`, `useDisconnect`, `useWalletClient`).

---

## Data Flow

### Reads

```
Frontend → Backend → Smart Contract / Database
```

Used for:

* ballot state
* proposals
* stats
* winner

### Writes (transactions)

```
Frontend → MetaMask → Ethereum (Sepolia)
```

Used for:

* voting
* chairperson actions

The backend is **never involved in signing transactions**.

---

## Error Handling

The frontend maps Ethereum reverts to user-friendly messages:

| Error          | User Message                        |
| -------------- | ----------------------------------- |
| Already voted  | "You have already voted"            |
| Not registered | "You are not registered as a voter" |
| Wrong stage    | "Voting is not open"                |
| Unknown revert | Generic fallback                    |

This avoids exposing raw RPC errors.

---

## Running the Frontend

### Development mode

```bash
npm run dev
```

Frontend runs on:

```
http://localhost:3001
```

---

## UX Rules

* Buttons are disabled if:

  * wallet is not connected
  * wrong ballot stage
  * user lacks permission
* All transactions show:

  * pending state
  * success feedback
  * clear failure messages

---

## Summary

This frontend demonstrates:

* clean Web3 wallet integration
* separation between reads and writes
* backend-assisted performance
* production-minded error handling

It is intentionally simple, explicit, and predictable.

