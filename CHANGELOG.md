# Changelog

## Unreleased — 0.2.0 (in progress, 2026-11-04)
- G1: config validation (`src/config.js`) with readable `ConfigError`; `config.example.json`.
- G2: `npm run verify` = tests + `npm pack` content/size/safety checks; GitHub Actions workflow.
- A1: external rules file (`rulesFile`) + optional hot reload (`rulesFileWatch`); missing file falls back to defaults.
- A2: dedupe state persistence (`dedupe.stateFile`, atomic writes, corrupt-state quarantine, `maxEntries` LRU).

## 0.1.1 (2026-11-02)
- Hardened after three-party audit (Hermes/Buddy/DSH). See ../AUDIT-2026-11-02.md.
- Fail-safe routing, literal-only user rules, negation handling, word boundaries.
- Concurrency locks, corrupt-state quarantine, UTC strict timestamps, ttl validation.
- Append-only event log, pointer whitelist, reproducible sampling seed.

## 0.1.0
- Initial MVP.
