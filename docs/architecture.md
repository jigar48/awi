# Architecture

Adapters validate canonical JSON and OTLP. Core normalization validates identity/graph structure and derives observed depth. Fingerprinting implements call identity. Analysis runs bounded rules and associates recorded leaf resources. Reporting renders safe terminal text. Config owns strict non-executable settings; security owns parsing, structural limits, sanitization and opt-in redaction. CLI alone accesses files and process streams. src/index.ts is the ESM library entry.

The supplied brief was truncated in its redaction section. The present requirements were implemented; no unseen requirements are claimed.

## Dependencies and support

Commander handles help/option validation and Zod validates configuration and trace/report schemas. Native Node APIs provide crypto, files and JSON. There are no HTTP clients or framework SDKs. TypeScript 5.9 stays within typescript-eslint's peer range. ESLint 10, Vitest 5, Prettier 3 and tsup 9 are pinned or constrained and locked. Their engines determine the supported Node floor. pnpm-workspace.yaml allows only esbuild's required install script.

Supported Node lines: 22.18+ on 22.x, 24.11+ on 24.x, and 26+. CI covers Windows/macOS/Linux and Node 22/24/26. Future majors require CI evidence before release compatibility claims. Builds target Node 22. CommonJS/browser builds are outside V1.

## Algorithms

SHA-256 fingerprints sort JSON keys. Rules group by trace and parent. Only fully timed, positive-duration, non-overlapping siblings form sequences. Untimed/zero-duration siblings disable sequence scanning for the group. Overlaps split runs; model/generic spans and calls without arguments interrupt tool segments. Neither parent relationships nor timestamps establish causality.

Repetition uses disjoint 100-call windows. Cycles are at most 16 calls long (default 6), with O(n × maximum cycle length squared) bounded scanning. Depth uses iterative memoized traversal and cycle detection. JSON recursion is bounded at depth 64. Findings and warnings sort deterministically; CLI sorts files. Reports omit clocks, absolute paths, raw errors and hashes.

## Release checks

Run pnpm check, pnpm format:check, pnpm schemas, pnpm audit, pnpm smoke:package and pnpm pack --out agent-workflow-inspector-1.0.0.tgz . Regenerate schemas when contracts change. Install the archive in an isolated directory and test CLI/library entry points. No release credentials are needed locally. Remote pushes, publication, tags and releases require maintainer approval; CI publishes nothing.
