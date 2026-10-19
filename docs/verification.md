# Verification record

Audit date: October 19, 2026. Package manager: pnpm 11.25.0. Baseline implementation: 9bc61c1. See the historical [audit findings](audit.md) and current [release procedure](releasing.md).

## Hosted CI and release candidate

The [nine-job hosted CI run](https://github.com/jigar48/awi/actions/runs/39208844432) completed successfully for `d2514af3e9d4a7b11a53308a77ab2ca40333d8ce`. Windows, macOS and Ubuntu each passed on Node 22.18.0, 24.11.0 and 26, including all 69 tests, typecheck/lint/build, formatting, schema consistency, production dependency audit, packing and isolated package installation/API checks.

The platform table below records the earlier local audit only. The hosted run resolves that audit's platform gate for d2514af. Later local release-preparation changes affect documentation/package metadata, not runtime source or dependencies. They require a fresh nine-job main run before publication; earlier CI does not validate them. No tag, GitHub release or npm publication has been performed.

Release-preparation validation on Windows Node 24.19.0: `pnpm install --frozen-lockfile`, `pnpm check` (69 passing tests, typecheck, lint, JS/declaration build), `pnpm format:check`, `pnpm schemas` (before/after schema hashes unchanged), full `pnpm audit` (no known vulnerabilities), `pnpm smoke:package` (clean external consumer, all shipped examples/options, ESM and strict TypeScript imports), and `git diff --check` passed. Runtime source, tests, dependencies, lockfile and CI workflow remain identical to d2514af. Local documentation links and prepared GitHub topic syntax were checked; version-tagged release links intentionally await tag creation. Maintainer GitHub/portfolio/support links responded successfully; LinkedIn rejects HEAD checks, so that supplied URL is retained without claiming live content verification. Candidate artifact byte counts, SHA-256/SHA-512 and source SHA are recorded outside the package in the local release manifest.

## Actual platform checks

| Environment                   | Node                      | Full tests | Typecheck / lint / full build | Isolated installed-package check |
| ----------------------------- | ------------------------- | ---------- | ----------------------------- | -------------------------------- |
| Windows x64                   | 24.19.0                   | 69 passed  | Passed                        | Passed                           |
| Ubuntu 24.04.3 x64 under WSL2 | 24.19.0                   | 69 passed  | Passed                        | Passed                           |
| Ubuntu 24.04.3 x64 under WSL2 | 22.18.0                   | 69 passed  | Passed                        | Passed                           |
| Ubuntu 24.04.3 x64 under WSL2 | 26.0.0                    | 69 passed  | Passed                        | Passed                           |
| macOS                         | Not available             | Not run    | Not run                       | Not run                          |
| Hosted GitHub Actions matrix  | 9 configured combinations | Not run    | Not run                       | Not run                          |

WSL uses real Linux Node distributions and independent Linux dependencies. Downloaded runtimes were verified against their official SHA-256 manifests. WSL/NTFS and Linux temporary-filesystem checks do not certify macOS or hosted runners. Windows Node 22/26 and the exact Node 24.11.0 floor remain for CI to verify. Future Node majors are not verified by these runs.

## Checks performed

- Strict TypeScript, ESLint and full JS/declaration builds.
- 69 tests: original 37 plus 32 targeted audit regressions, with additional assertions in existing tests. All six rules have positive/negative coverage; tests include exact concurrency/time boundaries, failure interactions, graph errors, OTLP encodings, source validation, deterministic fragments and capped findings, hostile content, terminal/JSON escaping, UTF-8/BOM, symlinks, overwrite/hardlink/long-name handling, resource budgets and operational exit codes.
- The original 50,000-operation performance assertion remains unchanged. Specific hostile metadata, wide-array and shared-string vectors return controlled errors in a 96 MiB child heap; this is not a universal minimum-memory guarantee for all maximum-size inputs.
- Network, DNS/fetch and subprocess APIs were blocked while analyzing hostile trace values; no external effects occurred.
- Frozen-lockfile installation, formatting, whitespace checks and deterministic schema regeneration.
- Full pnpm audit reported no known dependency vulnerabilities at audit time. This result can change; it does not assess all Node/OS vulnerabilities or prove absence of defects.
- Actual tarball allowlist, executable mode/shebang, bin/ESM/type export mappings, included maintainer documents, installation outside the repository with scripts disabled, all shipped examples/options and strict consumer TypeScript imports.

A cold-filesystem declaration compilation timeout and a multi-process CLI test timeout were diagnosed as test-harness I/O budgets, not waived product assertions. CLI setup compiles runtime JS with a bounded setup timeout; full builds/consumer typechecks still verify declarations. CLI subprocesses and end-to-end I/O cases have explicit budgets; detector performance checks remain unchanged.

During the original local audit, no remote mutations occurred. The later authorized feature-branch push produced the successful hosted run above. **Publication remains blocked until approval, a fresh successful matrix on the final main candidate, and npm authentication/name checks.** See [release procedure](releasing.md).
