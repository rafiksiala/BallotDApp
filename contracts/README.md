# 🧾 Smart Contracts — Ballot

This directory contains the Solidity smart contracts and Hardhat tooling used to deploy and interact with the on-chain voting system.

The smart contract is the **source of truth** for the application:
- voting lifecycle
- access control
- vote counting
- winner computation

All off-chain components (backend, database, frontend) depend on the state and events emitted here.

---

## Contract Overview

### Ballot.sol

The `Ballot` contract implements a complete on-chain voting system with a staged lifecycle.

**Lifecycle stages:**
```

Init → Reg → Vote → Done

````

**Core features:**
- Time-based stage progression
- Optional manual stage override (chairperson)
- Voter registration with weights
- Proposal-based voting
- Deterministic winner computation
- Strongly typed, index-friendly events

**Emitted events:**
- `StageChanged`
- `VoterRegistered`
- `VoteCast`
- `Finalized`

These events are consumed by the backend indexer.

---

## Tooling

- Solidity `^0.8.20`
- Hardhat `v2.22`
- ethers.js
- Sepolia testnet only

---

## Scripts

All scripts are located in `scripts/` and are designed to interact with the Ballot contract on Sepolia.

### Deployment & metadata
- `deploy.ts` — deploy the contract (Sepolia) and print deployment tx + block
- `export-abi.ts` — export ABI to `shared/contract-metadata/Ballot.abi.json`

### Read-only utilities
- `read.ts` — read on-chain state (stage, proposals, etc.)
- `balance.ts` — display ETH balances for configured accounts
- `winner.ts` — read winner data (if finalized)

### Chairperson actions (admin)
- `open-registration.ts` — move ballot into Registration stage (if manual mode enabled)
- `open-voting.ts` — move ballot into Voting stage (if manual mode enabled)
- `close-ballot.ts` — move ballot into Done stage (if manual mode enabled)
- `enable-manual.ts` — enable manual stage control (fallback mode)
- `disable-manual.ts` — disable manual stage control (return to time-based mode)
- `register-voters.ts` — register a list of voter addresses (chairperson only)
- `finalize.ts` — finalize the ballot (winner computation)

### Voter actions
- `vote.ts` — cast a vote from a voter wallet

### Helper
- `fund-voters.ts` — send test ETH from deployer to voter accounts (gas funding)

---

## Setup & Deployment

### Prerequisites
- Node.js (recommended: LTS)
- npm
- A Sepolia RPC URL (Alchemy / Infura / etc.)
- A funded Sepolia account (test ETH)

### Project initialization (Hardhat v2.22)

If the `contracts/` folder is not initialized yet:

```bash
mkdir contracts
cd contracts
npm init -y
npm install --save-dev hardhat@2.22.0
npx hardhat
````

When prompted by Hardhat, choose:

* **"Create a TypeScript project"**

This generates the basic Hardhat structure.

### Install dependencies

Install the required Hardhat + ethers tooling:

```bash
cd contracts
npm install --save-dev typescript ts-node @types/node dotenv
npm install --save-dev @nomicfoundation/hardhat-toolbox
```

This toolbox includes the Hardhat ethers plugin and ethers itself.

If you prefer explicit installs (optional):

```bash
npm install ethers
```

### Environment variables

Create `contracts/.env`:

```env
SEPOLIA_RPC_URL=
DEPLOYER_PRIVATE_KEY=
BALLOT_ADDRESS=
```

Notes:

* `DEPLOYER_PRIVATE_KEY` must be the private key of the deployer/chairperson wallet (Sepolia test wallet)
* never commit `.env`

### Compile

```bash
npx hardhat compile
```

### Run tests (local Hardhat network)

By default, tests run on the in-memory local Hardhat network:

```bash
npx hardhat test
```

### Deploy to Sepolia

```bash
npx hardhat run scripts/deploy.ts --network sepolia
```

After deployment:

* copy the printed contract address
* update `shared/contract-metadata/Ballot.address.json` (or run your export script if applicable)
* update `backend/.env` with `BALLOT_ADDRESS` and `DEPLOYMENT_BLOCK`
* update `frontend/.env` with `BALLOT_ADDRESS`

### Run interaction scripts

Examples:

```bash
# Read ballot state from Sepolia
npx hardhat run scripts/read.ts --network sepolia

# Register voters (chairperson only)
npx hardhat run scripts/register-voters.ts --network sepolia

# Fund voters with test ETH (so they can pay gas)
npx hardhat run scripts/fund-voters.ts --network sepolia

# Vote from a voter wallet
npx hardhat run scripts/vote.ts --network sepolia

# Finalize winner
npx hardhat run scripts/finalize.ts --network sepolia
```

---

## Notes

* This project never deploys to mainnet
* Test ETH is required for deployment and voting
* The deployer account is the initial chairperson
