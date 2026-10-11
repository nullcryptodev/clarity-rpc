# Changelog

All notable changes to `@claritychain/rpc` are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-01-01

### Added

- Typed `RpcClient` covering the full Clarity JSON-RPC surface.
- HTTP transport (uses global `fetch`) and WebSocket transport.
- `TxBuilder` with pluggable signing for transfer, staking, validator,
  AMM, order, and token transactions.
- `verifyProof` for state Merkle proofs.
- `BlockWatcher` and `TxWatcher` polling helpers, plus
  `waitForConfirmations`.
- Capability probing via `getMethods()`.
- BigInt-safe formatting helpers.