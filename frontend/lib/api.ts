// lib/api.ts
// Small fetch wrapper around the NestJS backend.
// We keep types here so the UI stays strongly typed.

const BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3000";

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, { method: "GET" });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${path} failed (${res.status}): ${text}`);
  }

  return (await res.json()) as T;
}

async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${path} failed (${res.status}): ${text}`);
  }
  return (await res.json()) as T;
}


// ----------------------------
// DTOs (backend response shapes)
// ----------------------------

export type BallotStateDto = {
  contractAddress: string;
  stage: string;
  regStart: string;
  regEnd: string;
  voteStart: string;
  voteEnd: string;
  totalVoters: string;
  totalVotes: string;
  winnerComputed: boolean;
  winningProposalId: string;
};

export type ProposalDto = {
  id: string;
  name: string;
  voteCount: string;
};

export type WinnerDto =
  | { winnerComputed: false; message: string }
  | {
      winnerComputed: true;
      winningProposalId: string;
      name: string;
      voteCount: string;
    };

export type StatsDto = {
  chainId: number;
  contractAddress: string;
  stage: number;
  totalVoters: number;
  totalVotes: number;
  participationRate: number;
  winner: { computed: boolean; proposalId: number };
  proposals: Array<{ id: number; name: string; voteCount: string }>;
  lastIndexedBlock: number;
};

// ----------------------------
// API calls
// ----------------------------

export function getBallotState() {
  return apiGet<BallotStateDto>("/ballot/state");
}

export function getBallotProposals() {
  return apiGet<ProposalDto[]>("/ballot/proposals");
}

export function getBallotWinner() {
  return apiGet<WinnerDto>("/ballot/winner");
}

export function getStats() {
  return apiGet<StatsDto>("/stats");
}

export function getEvents(limit = 25) {
  return apiGet<any[]>(`/events?limit=${limit}`);
}

// ----------------------------
// Chairperson / admin endpoints
// ----------------------------

// Returns the backend signer address (chairperson)
export async function getChairperson(): Promise<{ chairperson: string }> {
  return apiGet<{ chairperson: string }>("/ballot/chairperson");
}

// Registers a voter (chairperson-only, server-signed)
export async function registerVoter(voterAddress: string) {
  return apiPost<{
    ok: boolean;
    txHash: string;
    voter: string;
  }>("/ballot/register", { voterAddress });
}

// Finalizes the ballot (chairperson-only, server-signed)
export async function finalizeBallot() {
  return apiPost<{
    ok: boolean;
    txHash: string;
  }>("/ballot/finalize");
}
