"use client";

/**
 * Ballot dApp - Frontend (Option A: UX polish + targeted error handling)
 *
 * Key improvements in this version:
 * - Before sending a vote transaction, we run targeted on-chain pre-checks:
 *   - currentStage() must be Vote (2)
 *   - getVoter(address).weight must be > 0 (registered)
 *   - getVoter(address).voted must be false (not already voted)
 *   - proposalId must be valid (based on proposals list from backend)
 *
 * This avoids generic "missing revert data" and gives precise UI feedback.
 */

import { useEffect, useMemo, useState } from "react";
import { useAccount, useConnect, useConnectors, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ethers } from "ethers";

import {
  getBallotState,
  getBallotProposals,
  getBallotWinner,
  getStats,
  getEvents,
  getChairperson,
  registerVoter,
  finalizeBallot,
  type BallotStateDto,
  type ProposalDto,
  type StatsDto,
  type WinnerDto,
} from "@/lib/api";

// ----------------------------
// Minimal ABI for wallet interactions
// ----------------------------

/**
 * We keep a minimal ABI in the frontend to:
 * - vote()
 * - read currentStage()
 * - read getVoter()
 *
 * This is enough for targeted pre-checks without importing the full ABI.
 */
const BALLOT_ABI_MIN = [
  // vote(uint32 proposalId)
  "function vote(uint32 proposalId) external",

  // currentStage() returns Stage enum
  "function currentStage() view returns (uint8)",

  // getVoter(address) returns (uint96 weight, bool voted, uint32 voteValue)
  "function getVoter(address voter) view returns (uint96 weight, bool voted, uint32 voteValue)",
];

// ----------------------------
// Error mapping helper
// ----------------------------

/**
 * Map EVM/wallet/provider errors to user-friendly messages.
 * This is still useful as a fallback when a pre-check does not catch the issue.
 */
function prettifyEvmError(err: any): string {
  const msg =
    err?.shortMessage ||
    err?.reason ||
    err?.message ||
    err?.cause?.shortMessage ||
    err?.cause?.message ||
    "";

  const lower = String(msg).toLowerCase();

  // Contract-specific hints (best effort)
  if (lower.includes("alreadyvoted")) return "You already voted with this wallet.";
  if (lower.includes("notregistered"))
    return "This wallet is not registered. Ask the chairperson to register it during the Registration stage.";
  if (lower.includes("invalidproposal")) return "Invalid proposal selected.";
  if (lower.includes("badstage")) return "This action is not allowed in the current stage.";
  if (lower.includes("novotescast")) return "No votes were cast. Cannot finalize.";

  // Wallet / chain issues
  if (lower.includes("user rejected")) return "Transaction rejected in MetaMask.";
  if (lower.includes("insufficient funds"))
    return "Insufficient funds for gas. Fund this wallet with Sepolia ETH.";
  if (lower.includes("wrong network") || lower.includes("chain"))
    return "Wrong network. Switch MetaMask to Sepolia.";

  // Ethers generic when no revert data is returned
  if (lower.includes("missing revert data")) {
    return "Transaction reverted without a readable reason. Check: stage, registration, and whether you already voted.";
  }

  return msg || "Transaction failed.";
}

// ----------------------------
// Small UI helpers
// ----------------------------

function shortAddr(a?: string) {
  if (!a) return "";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function shortHash(h?: string) {
  if (!h) return "";
  return `${h.slice(0, 6)}…${h.slice(-4)}`;
}

function stageName(stageNum: number) {
  // Stage enum: 0 Init, 1 Reg, 2 Vote, 3 Done
  if (stageNum === 0) return "Init";
  if (stageNum === 1) return "Registration";
  if (stageNum === 2) return "Voting";
  if (stageNum === 3) return "Done";
  return "Unknown";
}

function stagePillStyle(stageNum: number) {
  if (stageNum === 0) return { background: "#f5f5f5", border: "1px solid #e6e6e6" };
  if (stageNum === 1) return { background: "#eef6ff", border: "1px solid #d5e8ff" };
  if (stageNum === 2) return { background: "#eefaf3", border: "1px solid #d6f2e1" };
  if (stageNum === 3) return { background: "#fff2e8", border: "1px solid #ffe0c9" };
  return { background: "#f5f5f5", border: "1px solid #e6e6e6" };
}

function formatEpochSec(epochSec: number) {
  const d = new Date(epochSec * 1000);
  return d.toLocaleString();
}

function Countdown({ nowSec, targetSec }: { nowSec: number; targetSec: number }) {
  const diff = targetSec - nowSec;
  if (diff <= 0) return <span>0s</span>;

  const s = diff % 60;
  const m = Math.floor(diff / 60) % 60;
  const h = Math.floor(diff / 3600);

  return (
    <span>
      {h > 0 ? `${h}h ` : ""}
      {m > 0 ? `${m}m ` : ""}
      {`${s}s`}
    </span>
  );
}

// ----------------------------
// Reusable UI components
// ----------------------------

function Card({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <section
      style={{
        marginTop: 16,
        padding: 16,
        border: "1px solid #eee",
        borderRadius: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h2 style={{ fontSize: 16, fontWeight: 650, margin: 0 }}>{title}</h2>
        <div style={{ marginLeft: "auto" }}>{right}</div>
      </div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </section>
  );
}

function Button({
  children,
  onClick,
  disabled,
  kind = "default",
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void | Promise<void>;
  disabled?: boolean;
  kind?: "default" | "primary" | "danger";
  title?: string;
}) {
  const base: React.CSSProperties = {
    padding: "9px 12px",
    borderRadius: 10,
    border: "1px solid #ddd",
    background: "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
    fontSize: 14,
  };

  if (kind === "primary") {
    base.border = "1px solid #cfe3ff";
    base.background = "#f4f9ff";
  }
  if (kind === "danger") {
    base.border = "1px solid #ffd3d3";
    base.background = "#fff6f6";
  }

  return (
    <button style={base} onClick={disabled ? undefined : onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

function Banner({
  stage,
  nowSec,
  regStart,
  regEnd,
  voteStart,
  voteEnd,
}: {
  stage: number;
  nowSec: number;
  regStart: number;
  regEnd: number;
  voteStart: number;
  voteEnd: number;
}) {
  let nextLabel = "";
  let nextTarget = 0;

  if (stage === 0) {
    nextLabel = "Registration opens in";
    nextTarget = regStart;
  } else if (stage === 1) {
    nextLabel = "Registration closes in";
    nextTarget = regEnd;
  } else if (stage === 2) {
    nextLabel = "Voting closes in";
    nextTarget = voteEnd;
  } else {
    nextLabel = "Ballot ended";
    nextTarget = nowSec;
  }

  const pill = stagePillStyle(stage);

  return (
    <div
      style={{
        padding: 14,
        borderRadius: 12,
        ...pill,
        display: "flex",
        gap: 14,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <div style={{ fontWeight: 700 }}>
        Stage: {stageName(stage)} <span style={{ opacity: 0.6 }}>({stage})</span>
      </div>

      <div style={{ opacity: 0.8, fontSize: 13 }}>
        {nextLabel}
        {stage !== 3 ? (
          <span style={{ marginLeft: 8, fontWeight: 700 }}>
            <Countdown nowSec={nowSec} targetSec={nextTarget} />
          </span>
        ) : (
          <span style={{ marginLeft: 8, fontWeight: 700 }}>✅</span>
        )}
      </div>

      <div style={{ marginLeft: "auto", fontSize: 12, opacity: 0.75 }}>
        Now: {formatEpochSec(nowSec)}
      </div>

      <div style={{ width: "100%", fontSize: 12, opacity: 0.75, lineHeight: 1.5 }}>
        <div>
          Reg window: {formatEpochSec(regStart)} → {formatEpochSec(regEnd)}
        </div>
        <div>
          Vote window: {formatEpochSec(voteStart)} → {formatEpochSec(voteEnd)}
        </div>
      </div>
    </div>
  );
}

function AdminActions({
  canRegister,
  canFinalize,
  onRegister,
  onFinalize,
}: {
  canRegister: boolean;
  canFinalize: boolean;
  onRegister: (addr: string) => Promise<void>;
  onFinalize: () => Promise<void>;
}) {
  const [voterAddress, setVoterAddress] = useState("");
  const [status, setStatus] = useState<string>("");

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          value={voterAddress}
          onChange={(e) => setVoterAddress(e.target.value)}
          placeholder="0xVoterAddress"
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #ddd",
            fontSize: 14,
          }}
        />

        <Button
          kind="primary"
          disabled={!canRegister}
          title={!canRegister ? "Registration is Stage=Reg (1) and chairperson only" : ""}
          onClick={async () => {
            try {
              const addr = voterAddress.trim();
              if (!addr) {
                setStatus("❌ Please provide a voter address.");
                return;
              }
              setStatus("Registering voter...");
              await onRegister(addr);
              setStatus("✅ Voter registered.");
              setVoterAddress("");
            } catch (e: any) {
              setStatus(`❌ ${prettifyEvmError(e)}`);
            }
          }}
        >
          Register voter
        </Button>
      </div>

      <div style={{ marginTop: 10 }}>
        <Button
          kind="danger"
          disabled={!canFinalize}
          title={!canFinalize ? "Finalize is Stage=Done (3), chairperson only, once" : ""}
          onClick={async () => {
            try {
              setStatus("Finalizing ballot...");
              await onFinalize();
              setStatus("✅ Ballot finalized.");
            } catch (e: any) {
              setStatus(`❌ ${prettifyEvmError(e)}`);
            }
          }}
        >
          Finalize
        </Button>
      </div>

      <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>{status}</div>

      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.65 }}>
        Note: Admin actions are executed by the backend signer (chairperson private key in backend/.env).
      </div>
    </div>
  );
}

// ----------------------------
// Main Page
// ----------------------------

export default function HomePage() {
  const queryClient = useQueryClient();

  // Prevent hydration mismatch for wallet-dependent UI
  const [mounted, setMounted] = useState(false);

  // Client-only clock for countdown banner
  const [nowSec, setNowSec] = useState<number>(0);

  useEffect(() => {
    setMounted(true);
    setNowSec(Math.floor(Date.now() / 1000));

    const t = setInterval(() => {
      setNowSec(Math.floor(Date.now() / 1000));
    }, 1000);

    return () => clearInterval(t);
  }, []);

  // Wallet state (wagmi v2)
  const { address, isConnected } = useAccount();
  const connectors = useConnectors();
  const { connectAsync, isPending: isConnectPending } = useConnect();
  const { disconnect } = useDisconnect();

  // Transaction status for on-chain vote
  const [txStatus, setTxStatus] = useState<
    | { type: "idle" }
    | { type: "checking"; message: string }
    | { type: "pending"; hash: string }
    | { type: "success"; hash: string }
    | { type: "error"; message: string }
  >({ type: "idle" });

  // ----------------------------
  // Backend reads (polling)
  // ----------------------------

  const stateQ = useQuery<BallotStateDto>({
    queryKey: ["ballot-state"],
    queryFn: getBallotState,
    refetchInterval: 5000,
  });

  const proposalsQ = useQuery<ProposalDto[]>({
    queryKey: ["ballot-proposals"],
    queryFn: getBallotProposals,
    refetchInterval: 5000,
  });

  const winnerQ = useQuery<WinnerDto>({
    queryKey: ["ballot-winner"],
    queryFn: getBallotWinner,
    refetchInterval: 5000,
  });

  const statsQ = useQuery<StatsDto>({
    queryKey: ["ballot-stats"],
    queryFn: getStats,
    refetchInterval: 5000,
  });

  const eventsQ = useQuery<any[]>({
    queryKey: ["events", 10],
    queryFn: () => getEvents(10),
    refetchInterval: 5000,
  });

  const chairQ = useQuery<{ chairperson: string }>({
    queryKey: ["chairperson"],
    queryFn: getChairperson,
    refetchInterval: 10000,
  });

  // Use contract address from backend as the source of truth
  const contractAddress = useMemo(() => {
    return stateQ.data?.contractAddress || "";
  }, [stateQ.data?.contractAddress]);

  const stageNum = useMemo(() => {
    const s = Number(stateQ.data?.stage ?? 0);
    return Number.isFinite(s) ? s : 0;
  }, [stateQ.data?.stage]);

  // Determine chairperson by comparing wallet address vs backend chairperson
  const isChairperson = useMemo(() => {
    if (!mounted) return false;
    if (!isConnected) return false;

    const chair = chairQ.data?.chairperson;
    if (!chair || !address) return false;

    return chair.toLowerCase() === address.toLowerCase();
  }, [mounted, isConnected, chairQ.data?.chairperson, address]);

  // Permission rules
  const canVote = mounted && isConnected && stageNum === 2;
  const canRegister = mounted && isConnected && isChairperson && stageNum === 1;

  const winnerComputed = Boolean(stateQ.data?.winnerComputed ?? false);
  const canFinalize = mounted && isConnected && isChairperson && stageNum === 3 && !winnerComputed;

  const winnerId = useMemo(() => {
    const w = Number(stateQ.data?.winningProposalId ?? 0);
    return Number.isFinite(w) ? w : 0;
  }, [stateQ.data?.winningProposalId]);

  // ----------------------------
  // Targeted pre-checks for vote()
  // ----------------------------

  /**
   * Run on-chain pre-checks to produce precise errors BEFORE sending a transaction.
   * This avoids generic "missing revert data".
   */
  async function precheckVote(proposalId: number) {
    // Ensure wallet is connected
    if (!mounted || !isConnected || !address) {
      return { ok: false as const, message: "Connect your wallet to vote." };
    }

    // Ensure contract address is known
    if (!contractAddress) {
      return { ok: false as const, message: "Missing contract address from backend state." };
    }

    // Ensure proposalId exists (use backend proposals list as UI truth)
    const proposals = proposalsQ.data || [];
    if (proposalId < 0 || proposalId >= proposals.length) {
      return { ok: false as const, message: "Invalid proposal selected." };
    }

    // Ensure MetaMask provider is available
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ethProvider = (window as any).ethereum;
    if (!ethProvider) {
      return { ok: false as const, message: "MetaMask provider not found. Install MetaMask." };
    }

    // Create a read provider
    const provider = new ethers.BrowserProvider(ethProvider);

    // Create a read-only contract instance (no signer needed for read checks)
    const readContract = new ethers.Contract(contractAddress, BALLOT_ABI_MIN, provider);

    // Check current stage on-chain (most accurate)
    setTxStatus({ type: "checking", message: "Checking current stage..." });
    const chainStageRaw = await readContract.currentStage();
    const chainStage = Number(chainStageRaw);

    if (chainStage !== 2) {
      return {
        ok: false as const,
        message: `Voting is not open. Current stage is ${stageName(chainStage)} (${chainStage}).`,
      };
    }

    // Check voter status on-chain
    setTxStatus({ type: "checking", message: "Checking your voter status..." });
    const voter = await readContract.getVoter(address);

    // Ethers returns a Result object where:
    // voter[0] = weight, voter[1] = voted, voter[2] = voteValue
    const weight = BigInt(voter[0]);
    const voted = Boolean(voter[1]);

    if (weight === 0n) {
      return {
        ok: false as const,
        message: "You are not registered. Ask the chairperson to register your wallet during Registration stage.",
      };
    }

    if (voted) {
      return { ok: false as const, message: "You already voted with this wallet." };
    }

    return { ok: true as const };
  }

  // ----------------------------
  // Actions
  // ----------------------------

  /**
   * Vote on-chain using the connected wallet.
   * We run targeted pre-checks first to avoid generic RPC revert messages.
   */
  async function vote(proposalId: number) {
    try {
      // Basic UI guard
      if (!mounted) return;

      // Pre-checks (targeted)
      const check = await precheckVote(proposalId);
      if (!check.ok) {
        setTxStatus({ type: "error", message: check.message });
        return;
      }

      // At this point, we know:
      // - wallet connected
      // - on-chain stage is Vote (2)
      // - voter is registered
      // - voter has not voted yet
      // - proposalId is valid
      setTxStatus({ type: "idle" });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ethProvider = (window as any).ethereum;
      const provider = new ethers.BrowserProvider(ethProvider);

      // Get signer to send transaction
      const signer = await provider.getSigner();

      // Contract connected to signer for write
      const writeContract = new ethers.Contract(contractAddress, BALLOT_ABI_MIN, signer);

      // Send vote tx
      const tx = await writeContract.vote(proposalId);
      setTxStatus({ type: "pending", hash: tx.hash });

      // Wait for 1 confirmation
      await tx.wait(1);
      setTxStatus({ type: "success", hash: tx.hash });

      // Refresh backend reads (indexer may lag slightly; polling also helps)
      await queryClient.invalidateQueries({ queryKey: ["ballot-state"] });
      await queryClient.invalidateQueries({ queryKey: ["ballot-proposals"] });
      await queryClient.invalidateQueries({ queryKey: ["ballot-winner"] });
      await queryClient.invalidateQueries({ queryKey: ["ballot-stats"] });
      await queryClient.invalidateQueries({ queryKey: ["events"] });
    } catch (e: any) {
      setTxStatus({ type: "error", message: prettifyEvmError(e) });
    }
  }

  async function handleRegister(voterAddr: string) {
    if (!canRegister) {
      throw new Error("Register is only available during Stage=Reg (1) for chairperson.");
    }

    await registerVoter(voterAddr);

    await queryClient.invalidateQueries({ queryKey: ["events"] });
    await queryClient.invalidateQueries({ queryKey: ["ballot-state"] });
    await queryClient.invalidateQueries({ queryKey: ["ballot-stats"] });
  }

  async function handleFinalize() {
    if (!canFinalize) {
      throw new Error("Finalize is only available during Stage=Done (3) for chairperson, and only once.");
    }

    await finalizeBallot();

    await queryClient.invalidateQueries({ queryKey: ["events"] });
    await queryClient.invalidateQueries({ queryKey: ["ballot-winner"] });
    await queryClient.invalidateQueries({ queryKey: ["ballot-state"] });
    await queryClient.invalidateQueries({ queryKey: ["ballot-stats"] });
    await queryClient.invalidateQueries({ queryKey: ["ballot-proposals"] });
  }

  // ----------------------------
  // Render
  // ----------------------------

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>Ballot dApp</h1>
      <div style={{ marginTop: 6, fontSize: 13, opacity: 0.75 }}>
        Backend reads on-chain state, indexes events into PostgreSQL, and exposes a REST API.
      </div>

      {/* Status banner */}
      <Card title="Status">
        {!mounted ? (
          <div style={{ fontSize: 14, opacity: 0.75 }}>Loading...</div>
        ) : stateQ.isLoading ? (
          <div style={{ fontSize: 14, opacity: 0.75 }}>Loading status...</div>
        ) : stateQ.isError ? (
          <div style={{ fontSize: 14, color: "crimson" }}>
            Error: {(stateQ.error as Error).message}
          </div>
        ) : !stateQ.data ? (
          <div style={{ fontSize: 14, opacity: 0.75 }}>No data</div>
        ) : (
          <Banner
            stage={stageNum}
            nowSec={nowSec}
            regStart={Number(stateQ.data.regStart)}
            regEnd={Number(stateQ.data.regEnd)}
            voteStart={Number(stateQ.data.voteStart)}
            voteEnd={Number(stateQ.data.voteEnd)}
          />
        )}
      </Card>

      {/* Wallet */}
      <Card
        title="Wallet"
        right={
          <div style={{ fontSize: 12, opacity: 0.7 }}>
            {mounted ? `Connectors: ${connectors.map((c) => c.name).join(", ") || "none"}` : ""}
          </div>
        }
      >
        {!mounted ? (
          <div style={{ fontSize: 14, opacity: 0.75 }}>Loading wallet...</div>
        ) : !isConnected ? (
          <div>
            <Button
              kind="primary"
              disabled={isConnectPending}
              onClick={async () => {
                await connectAsync({ connector: injected() });
              }}
              title="Connect using injected wallet (MetaMask)"
            >
              {isConnectPending ? "Connecting..." : "Connect MetaMask"}
            </Button>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7 }}>
              Connect your wallet to vote and (if chairperson) manage the ballot.
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 14, opacity: 0.85 }}>
              Connected: <strong>{address}</strong>{" "}
              <span style={{ marginLeft: 10, fontSize: 12, opacity: 0.7 }}>
                ({shortAddr(address)})
              </span>
            </div>

            <div style={{ marginTop: 8 }}>
              <Button onClick={() => disconnect()}>Disconnect</Button>
            </div>
          </div>
        )}

        {/* Transaction status */}
        <div style={{ marginTop: 12, fontSize: 14 }}>
          {txStatus.type === "idle" && <span style={{ opacity: 0.7 }}>Tx: idle</span>}
          {txStatus.type === "checking" && <span>🔎 {txStatus.message}</span>}
          {txStatus.type === "pending" && <span>⏳ Tx pending: {shortHash(txStatus.hash)}</span>}
          {txStatus.type === "success" && <span>✅ Tx success: {shortHash(txStatus.hash)}</span>}
          {txStatus.type === "error" && (
            <span style={{ color: "crimson" }}>❌ {txStatus.message}</span>
          )}
        </div>

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7, lineHeight: 1.5 }}>
          <div>
            Voting enabled (UI): <strong>{String(canVote)}</strong> (Stage=Vote and wallet connected)
          </div>
          <div>
            Chairperson:{" "}
            <strong>{chairQ.data?.chairperson ? shortAddr(chairQ.data.chairperson) : "Loading..."}</strong>
            {isConnected ? (
              <span style={{ marginLeft: 8 }}>
                | You are chairperson: <strong>{String(isChairperson)}</strong>
              </span>
            ) : null}
          </div>
        </div>
      </Card>

      {/* Admin */}
      <Card title="Admin (chairperson)">
        {!mounted ? (
          <div style={{ fontSize: 14, opacity: 0.75 }}>Loading...</div>
        ) : !isConnected ? (
          <div style={{ fontSize: 13, opacity: 0.75 }}>Connect a wallet to check permissions.</div>
        ) : !isChairperson ? (
          <div style={{ fontSize: 13, color: "crimson" }}>
            Connect the chairperson wallet to enable admin actions.
          </div>
        ) : (
          <AdminActions
            canRegister={canRegister}
            canFinalize={canFinalize}
            onRegister={handleRegister}
            onFinalize={handleFinalize}
          />
        )}

        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7, lineHeight: 1.5 }}>
          <div>
            Register enabled: <strong>{String(canRegister)}</strong> (Stage=Reg only)
          </div>
          <div>
            Finalize enabled: <strong>{String(canFinalize)}</strong> (Stage=Done only, once)
          </div>
        </div>
      </Card>

      {/* Proposals */}
      <Card title="Proposals">
        {proposalsQ.isLoading ? (
          <div style={{ fontSize: 14, opacity: 0.75 }}>Loading...</div>
        ) : proposalsQ.isError ? (
          <div style={{ fontSize: 14, color: "crimson" }}>
            Error: {(proposalsQ.error as Error).message}
          </div>
        ) : !proposalsQ.data ? (
          <div style={{ fontSize: 14, opacity: 0.75 }}>No data</div>
        ) : (
          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 10 }}>
              Vote buttons run on-chain pre-checks to show targeted errors.
            </div>

            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {proposalsQ.data.map((p) => {
                const pid = Number(p.id);
                const isWinner = winnerComputed && pid === winnerId;

                return (
                  <li key={p.id} style={{ marginBottom: 12 }}>
                    <div
                      style={{
                        display: "flex",
                        gap: 12,
                        alignItems: "center",
                        padding: 10,
                        borderRadius: 12,
                        border: "1px solid #eee",
                        background: isWinner ? "#f7fff9" : "#fff",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>
                          #{p.id} — {p.name}{" "}
                          {isWinner ? (
                            <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.8 }}>✅ Winner</span>
                          ) : null}
                        </div>

                        <div style={{ marginTop: 4, fontSize: 13, opacity: 0.85 }}>
                          Vote count: <strong>{p.voteCount}</strong>
                        </div>
                      </div>

                      <Button
                        kind="primary"
                        disabled={!mounted || !isConnected}
                        title={!isConnected ? "Connect your wallet to vote" : ""}
                        onClick={() => vote(pid)}
                      >
                        Vote
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7, lineHeight: 1.5 }}>
              <div>
                If you see “Insufficient funds”, fund the voter wallet with Sepolia ETH (faucet) and try again.
              </div>
              <div>
                If you see “Not registered”, ask the chairperson to register that wallet during Stage=Reg (1).
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Winner */}
      <Card title="Winner">
        {winnerQ.isLoading ? (
          <div style={{ fontSize: 14, opacity: 0.75 }}>Loading...</div>
        ) : winnerQ.isError ? (
          <div style={{ fontSize: 14, color: "crimson" }}>
            Error: {(winnerQ.error as Error).message}
          </div>
        ) : !winnerQ.data ? (
          <div style={{ fontSize: 14, opacity: 0.75 }}>No data</div>
        ) : (
          <div style={{ fontSize: 14, lineHeight: 1.6 }}>
            {winnerQ.data.winnerComputed ? (
              <div
                style={{
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid #d6f2e1",
                  background: "#eefaf3",
                }}
              >
                ✅ Winner: <strong>{winnerQ.data.name}</strong>{" "}
                <span style={{ opacity: 0.75 }}>(id: {winnerQ.data.winningProposalId})</span>
                <div style={{ marginTop: 6 }}>
                  Vote count: <strong>{winnerQ.data.voteCount}</strong>
                </div>
              </div>
            ) : (
              <div style={{ opacity: 0.85 }}>⏳ {winnerQ.data.message || "Winner not computed yet."}</div>
            )}
          </div>
        )}
      </Card>

      {/* Stats */}
      <Card title="Stats (backend → DB read-model)">
        {statsQ.isLoading ? (
          <div style={{ fontSize: 14, opacity: 0.75 }}>Loading...</div>
        ) : statsQ.isError ? (
          <div style={{ fontSize: 14, color: "crimson" }}>
            Error: {(statsQ.error as Error).message}
          </div>
        ) : !statsQ.data ? (
          <div style={{ fontSize: 14, opacity: 0.75 }}>No data</div>
        ) : (
          <div style={{ fontSize: 14, lineHeight: 1.7 }}>
            <div>
              Participation rate: <strong>{statsQ.data.participationRate}</strong>
            </div>
            <div>
              Total voters (snapshot): <strong>{statsQ.data.totalVoters}</strong>
            </div>
            <div>
              Total votes (snapshot): <strong>{statsQ.data.totalVotes}</strong>
            </div>
            <div>
              Last indexed block: <strong>{statsQ.data.lastIndexedBlock}</strong>
            </div>
            <div>
              Winner (DB): computed=<strong>{String(statsQ.data.winner.computed)}</strong> proposalId=
              <strong>{statsQ.data.winner.proposalId}</strong>
            </div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.7, lineHeight: 1.5 }}>
              The stats endpoint reads a PostgreSQL snapshot built from indexed on-chain events.
              This is a classic “read-model” pattern.
            </div>
          </div>
        )}
      </Card>

      {/* Latest events */}
      <Card title="Latest Events (backend → DB)">
        {eventsQ.isLoading ? (
          <div style={{ fontSize: 14, opacity: 0.75 }}>Loading...</div>
        ) : eventsQ.isError ? (
          <div style={{ fontSize: 14, color: "crimson" }}>
            Error: {(eventsQ.error as Error).message}
          </div>
        ) : !eventsQ.data ? (
          <div style={{ fontSize: 14, opacity: 0.75 }}>No data</div>
        ) : eventsQ.data.length === 0 ? (
          <div style={{ fontSize: 14, opacity: 0.75 }}>No events indexed yet.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  <th style={{ borderBottom: "1px solid #eee", padding: 8 }}>Block</th>
                  <th style={{ borderBottom: "1px solid #eee", padding: 8 }}>Event</th>
                  <th style={{ borderBottom: "1px solid #eee", padding: 8 }}>Tx</th>
                  <th style={{ borderBottom: "1px solid #eee", padding: 8 }}>Args</th>
                </tr>
              </thead>
              <tbody>
                {eventsQ.data.map((ev) => (
                  <tr key={`${ev.txHash}-${ev.logIndex}`}>
                    <td style={{ borderBottom: "1px solid #f3f3f3", padding: 8 }}>{ev.blockNumber}</td>
                    <td style={{ borderBottom: "1px solid #f3f3f3", padding: 8 }}>{ev.eventName}</td>
                    <td style={{ borderBottom: "1px solid #f3f3f3", padding: 8 }}>{shortHash(ev.txHash)}</td>
                    <td style={{ borderBottom: "1px solid #f3f3f3", padding: 8 }}>
                      {JSON.stringify(ev.argsJson || {})}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7, lineHeight: 1.5 }}>
              Events appear after the backend indexer has polled logs and stored them in PostgreSQL.
            </div>
          </div>
        )}
      </Card>

      <div style={{ marginTop: 20, fontSize: 12, opacity: 0.65, lineHeight: 1.6 }}>
        <div>Tip: If API calls fail, ensure the backend is running and CORS allows your frontend origin.</div>
        <div>Tip: If indexing hits RPC rate limits, reduce backend polling frequency or batch size.</div>
      </div>
    </main>
  );
}
