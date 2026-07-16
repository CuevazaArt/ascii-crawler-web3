// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title LeakRunnerXRPL (conceptual bridge notes)
 * @notice Leak Runner is intended for XRPL (via Xaman) when live — not EVM deployment.
 *         The browser client today is largely a simulator; this file documents economic
 *         intents that map to native XRPL transactions for demos / future hooks.
 *         Live mainnet deployments may charge real XRP (see docs/LEGAL.md).
 *
 * XRPL native mapping (implemented in client simulator today):
 *   - Stake / entry          → Payment (XRP) into game escrow account
 *   - Drop harvest reward    → Payment or PaymentChannelClaim (micropayouts)
 *   - Exploit slash bonus    → Payment (XRP) to player
 *   - Ledger Relic seize     → Payment (XRP) + XLS-20 memo
 *   - Score persistence      → AccountSet + Memo (ScoreCommit) keyed by r-address
 *   - High-score board       → off-ledger index of ScoreCommit memos (or sidechain)
 *   - Node permadeath        → NFTokenBurn (XLS-20 Node NFT)
 *   - Skin unlock            → NFTokenAcceptOffer / Payment for offer
 *   - Wallet                 → Xaman sign requests (when live)
 *
 * Suggested demo amounts:
 *   ENTRY_STAKE      = 0.5 XRP
 *   DROP_REWARD      = 0.0005 XRP (channel accrue → settle)
 *   EXPLOIT_SLASH    = 0.01 XRP
 *   SKIN_COST        = 1 XRP → jackpot 40% / milestones 20% / dev 40%
 *
 * Stake split: earn 70% | jackpot 8% | topN 4% | milestones 3% | dev 10% | reserve 5%
 * Bags: jackpot (epoch #1–#3), topN (top-5), milestones (first-hit), reserve (house), dev
 * Epoch resolve + soft-cap jackpot; unused earn escrow → house edge
 *
 * ScoreCommit memo format (demo):
 *   ScoreCommit:<pts>|drops:<n>|relics:<n>|best:<personalBest>
 */

/// @dev Placeholder interfaces so tooling that expects a .sol file still resolves.
interface ILeakRunnerEscrow {
    function stakeBoot(uint256 nodeTokenId) external payable;
    function claimDropReward(uint256 drops) external;
    function slashExploit(uint256 exploitId) external;
    function cashOut() external;
    function slashNode(uint256 nodeTokenId) external;
    function commitScore(uint256 score, uint256 drops, uint256 relics) external;
}

contract LeakRunnerXRPLNotes {
    // Not for deployment — see blockchain.js XRPL simulator + Xaman UX.
}
