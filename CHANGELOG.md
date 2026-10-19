# Changelog

## 1.0.0 — Unreleased

Initial local V1: canonical AWI JSON and OTLP subset; strict validation; SHA-256 fingerprints; six bounded rules; CLI/library; human/JSON reports; configuration; synthetic examples; security/regression/CLI tests; schemas; cross-platform CI. No npm publication or public release performed.

### Pre-release audit fixes

Fixed canonicalization CPU amplification, bounded ignored-path compilation/caching, missing-identity evidence handling, repeated tools hidden by interleaved model spans, nanosecond/concurrent sequence false positives, retry-storm recovery handling, partial AWI002 defaults, impossible thresholds, source-reference validation, metadata amplification, malformed OTLP coercions, blank failure evidence, fragment determinism, public-renderer injection, symlink ancestors, invalid UTF-8 and broken pipes. Packed maintainer documents are included; the isolated-consumer smoke test now checks all examples, executable mode and TypeScript declarations. CI actions are SHA-pinned with no persisted checkout credentials.
