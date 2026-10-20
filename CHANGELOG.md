# Changelog

## Unreleased

Added an offline synthetic quickstart verifier and CI matrix step; corrected publication status and source/consumer instructions. No runtime, API, or dependency changes.

## 1.0.0 — 2026-10-19

Initial local V1: canonical AWI JSON and OTLP subset; strict validation; SHA-256 fingerprints; six bounded rules; CLI/library; human/JSON reports; configuration; synthetic examples; security/regression/CLI tests; schemas; cross-platform CI. Published on GitHub and npm; status confirmed October 20, 2026 (see [release procedure](docs/releasing.md)).

### Release preparation

Added package homepage, issue tracker, keywords and optional funding metadata; clearer installation and maintainer guidance; release notes and an explicit approval-gated publication procedure. The audited commit passed all nine hosted CI jobs. Release-preparation commits require a fresh matrix before publication. No runtime behavior or dependencies changed.

### Pre-release audit fixes

Fixed canonicalization CPU amplification, bounded ignored-path compilation/caching, missing-identity evidence handling, repeated tools hidden by interleaved model spans, nanosecond/concurrent sequence false positives, retry-storm recovery handling, partial AWI002 defaults, impossible thresholds, source-reference validation, metadata amplification, malformed OTLP coercions, blank failure evidence, fragment determinism, public-renderer injection, symlink ancestors, invalid UTF-8 and broken pipes. Packed maintainer documents are included; the isolated-consumer smoke test now checks all examples, executable mode and TypeScript declarations. CI actions are SHA-pinned with no persisted checkout credentials.
