# Troubleshooting

- Invalid JSON/schema: use UTF-8 JSON, supported version and fields. JSONL/collector envelopes need conversion.
- Ambiguous format: remove conflicting roots or explicitly select input-format; schemas still apply.
- No sequence findings: read warnings. Recorded arguments, positive-duration times, shared parent and non-overlap are required. Patterns may span bounded windows.
- Duplicate IDs: files sharing traceId merge. Give unrelated executions different identities.
- Filesystem failure: check permissions, existing output, regular inputs and hard-link support. Use a new report path.
- Directory rejected: use a dedicated JSON trace directory; empty dirs, symlinks, unrelated files and excessive recursion fail.
- Exit 2: severity met fail-on (default high). Review evidence or adjust policy.
- Exit 1/incomplete: fix input or split workloads. Finding overflow is not success.
- Missing tokens/cost: unknown remains absent; parent totals are not attributed to tools.
- Install engines failure: use supported Node. Do not bypass engines or delete lockfile to hide incompatibility.
