# Local verification

Validated on October 19, 2026 using Windows, Node 24.19.0 and pnpm 11.25.0.

- Strict TypeScript check, ESLint and production build passed.
- 37 Vitest tests passed, including positive/negative cases for all six rules, graph errors, OTLP mapping, fingerprints, resource attribution, security limits, terminal/JSON escaping, truncation, exit codes, directory symlinks and overwrite/hardlink protection.
- The suite exercises 50,000 operations and rejects finding overflow as incomplete. This is a regression check, not a general performance guarantee.
- Prettier validation and deterministic schema regeneration passed.
- Frozen-lockfile installation passed. Full pnpm audit reported no known vulnerabilities at verification time; this can change as advisories are updated.
- pnpm smoke:package built an archive, installed it in an isolated directory, verified the installed awi executable, healthy/suspicious exit codes and the public ESM library/report validator. This did not publish anything.

Node 22/26, Linux and macOS checks are configured in CI and have not been executed remotely by this implementation. No remote push, tag, npm publish, public release or deployment was performed. The implementation brief ends mid-sentence in report redaction; only the supplied requirements are covered.
