// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Ballot (Interview-ready demo)
/// @notice On-chain ballot with staged lifecycle, time windows, weighted voting, and indexable events.
/// @dev Source of truth is on-chain. Backend can index events to build a read model.
contract Ballot {
    // ----------------------------
    // Types
    // ----------------------------
    enum Stage { Init, Reg, Vote, Done }

    struct Voter {
        uint96 weight;   // 0 = not registered; >0 = eligible
        bool voted;
        uint32 vote;     // proposal index
    }

    struct Proposal {
        string name;
        uint256 voteCount; // sum of weights
    }

    // ----------------------------
    // State
    // ----------------------------
    address public immutable chairperson;

    Stage public stage;
    bool public manualMode;

    uint64 public immutable regStart;
    uint64 public immutable regEnd;
    uint64 public immutable voteStart;
    uint64 public immutable voteEnd;

    mapping(address => Voter) private _voters;
    Proposal[] private _proposals;

    uint32 public totalVoters; // number of eligible voters (weight > 0)
    uint32 public totalVotes;  // number of cast votes (not sum of weights)

    uint32 public winningProposalId;
    bool public winnerComputed;

    // ----------------------------
    // Events (index-friendly)
    // ----------------------------
    event StageChanged(Stage indexed newStage, uint64 timestamp);

    event VoterRegistered(address indexed voter, uint96 weight);
    event VoteCast(address indexed voter, uint32 indexed proposalId, uint96 weight);

    event Finalized(uint32 indexed winningProposalId, uint256 winningVoteCount, uint64 timestamp);

    // ----------------------------
    // Errors
    // ----------------------------
    error OnlyChair();
    error BadStage(Stage expected, Stage actual);
    error AlreadyRegistered();
    error NotRegistered();
    error AlreadyVoted();
    error InvalidProposal();
    error NoVotesCast();

    // ----------------------------
    // Constructor
    // ----------------------------
    /// @param proposalNames Names of proposals (UI-friendly)
    /// @param _regStart Registration start timestamp (unix)
    /// @param regDurationSec Registration duration in seconds
    /// @param voteDurationSec Voting duration in seconds
    constructor(
        string[] memory proposalNames,
        uint64 _regStart,
        uint64 regDurationSec,
        uint64 voteDurationSec
    ) {
        require(proposalNames.length > 1, "Need >=2 proposals");
        require(regDurationSec > 0 && voteDurationSec > 0, "Bad durations");

        chairperson = msg.sender;

        regStart = _regStart;
        regEnd = _regStart + regDurationSec;

        voteStart = regEnd;
        voteEnd = voteStart + voteDurationSec;

        for (uint256 i = 0; i < proposalNames.length; i++) {
            _proposals.push(Proposal({ name: proposalNames[i], voteCount: 0 }));
        }

        // chairperson eligible with weight=2
        _voters[chairperson] = Voter({ weight: 2, voted: false, vote: 0 });
        totalVoters = 1;

        stage = Stage.Init;
        emit StageChanged(stage, uint64(block.timestamp));
    }

    // ----------------------------
    // Modifiers / internal
    // ----------------------------
    modifier onlyChair() {
        if (msg.sender != chairperson) revert OnlyChair();
        _;
    }

    modifier atStage(Stage expected) {
        _syncStage();
        if (stage != expected) revert BadStage(expected, stage);
        _;
    }

    /// @dev Advances stage based on time windows (deterministic)
    function _syncStage() internal {
        // If manual mode is enabled, do not auto-sync from timestamps
        if (manualMode) return;

        uint64 nowTs = uint64(block.timestamp);

        Stage newStage;
        if (nowTs < regStart) {
            newStage = Stage.Init;
        } else if (nowTs < regEnd) {
            newStage = Stage.Reg;
        } else if (nowTs < voteEnd) {
            newStage = Stage.Vote;
        } else {
            newStage = Stage.Done;
        }

        if (newStage != stage) {
            stage = newStage;
            emit StageChanged(stage, nowTs);
        }
    }

    // ----------------------------
    // View getters
    // ----------------------------
    function getProposalCount() external view returns (uint256) {
        return _proposals.length;
    }

    function getProposal(uint32 proposalId) external view returns (string memory name, uint256 voteCount) {
        if (proposalId >= _proposals.length) revert InvalidProposal();
        Proposal storage p = _proposals[proposalId];
        return (p.name, p.voteCount);
    }

    function getVoter(address voter) external view returns (uint96 weight, bool voted, uint32 voteValue) {
        Voter storage v = _voters[voter];
        return (v.weight, v.voted, v.vote);
    }

    function currentStage() external view returns (Stage) {
        if (manualMode) return stage;

        uint64 nowTs = uint64(block.timestamp);
        if (nowTs < regStart) return Stage.Init;
        if (nowTs < regEnd) return Stage.Reg;
        if (nowTs < voteEnd) return Stage.Vote;
        return Stage.Done;
    }

    // ----------------------------
    // Actions
    // ----------------------------
    function enableManualMode() external onlyChair {
        manualMode = true;
    }

    function disableManualMode() external onlyChair {
        manualMode = false;
        _syncStage(); // immediately align with time-based stage
    }

    function openRegistration() external onlyChair {
        manualMode = true;
        if (stage != Stage.Init) revert BadStage(Stage.Init, stage);

        stage = Stage.Reg;
        emit StageChanged(stage, uint64(block.timestamp));
    }

    function openVoting() external onlyChair {
        manualMode = true;
        if (stage != Stage.Reg) revert BadStage(Stage.Reg, stage);

        stage = Stage.Vote;
        emit StageChanged(stage, uint64(block.timestamp));
    }

    function closeBallot() external onlyChair {
        manualMode = true;
        if (stage != Stage.Vote) revert BadStage(Stage.Vote, stage);

        stage = Stage.Done;
        emit StageChanged(stage, uint64(block.timestamp));
    }

    function register(address voter) external onlyChair atStage(Stage.Reg) {
        require(voter != address(0), "Zero address");

        Voter storage v = _voters[voter];
        if (v.weight != 0) revert AlreadyRegistered();

        v.weight = 1;
        v.voted = false;

        totalVoters += 1;
        emit VoterRegistered(voter, 1);
    }

    function vote(uint32 proposalId) external atStage(Stage.Vote) {
        if (proposalId >= _proposals.length) revert InvalidProposal();

        Voter storage sender = _voters[msg.sender];
        if (sender.weight == 0) revert NotRegistered();
        if (sender.voted) revert AlreadyVoted();

        sender.voted = true;
        sender.vote = proposalId;

        _proposals[proposalId].voteCount += sender.weight;
        totalVotes += 1;

        emit VoteCast(msg.sender, proposalId, sender.weight);
    }

    /// @notice Finalize winner (anyone can call) once stage is Done
    function finalize() external onlyChair atStage(Stage.Done) {
        if (winnerComputed) return; // idempotent

        uint256 winningVoteCount = 0;
        uint32 winnerId = 0;

        for (uint32 i = 0; i < _proposals.length; i++) {
            uint256 c = _proposals[i].voteCount;
            if (c > winningVoteCount) {
                winningVoteCount = c;
                winnerId = i;
            }
        }

        if (winningVoteCount == 0) revert NoVotesCast();

        winningProposalId = winnerId;
        winnerComputed = true;

        emit Finalized(winnerId, winningVoteCount, uint64(block.timestamp));
    }
}
