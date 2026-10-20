# Release procedure

## v1.0.0 status (verified October 20, 2026)

- [GitHub release](https://github.com/jigar48/awi/releases/tag/v1.0.0): published October 19, 2026, neither draft nor prerelease. Assets include the package tarball and `release-candidate.json` (an artifact filename, not the current release status).
- Annotated tag `v1.0.0` resolves to commit `1baca3ebdcc4da792f11487483abf3f60c22d1fb`. The default branch is `main`.
- [npm registry version](https://registry.npmjs.org/agent-workflow-inspector/1.0.0): HTTP 200, name `agent-workflow-inspector`, version `1.0.0`, published October 19, 2026.
- Registry tarball integrity: `sha512-lLYHfyeswXS2mF13a0a0YLKkdC6PSSYBnZM74XuYsqfHIiNTkBFQDk6gmhb3fcaAH3Ebf+W+lDo/LxUKv9CAXw==`.

These are read-only metadata checks, not a fresh registry installation or byte comparison against GitHub assets. The registry README still contains historical candidate wording; local documentation changes do not modify existing npm metadata or release assets.

## Future releases

Publication is a separate maintainer action requiring explicit authorization. Never republish 1.0.0, move its tag, or replace its assets to include these later changes.

1. Choose an unused version and review source, package metadata, changelog and release notes. Confirm current registry ownership and existing tags/releases without exposing credentials.
2. Run `pnpm install --frozen-lockfile`, `pnpm check`, `pnpm verify:quickstart`, `pnpm format:check`, `pnpm schemas`, `git diff --exit-code -- docs/schemas`, `pnpm audit --prod`, and `pnpm smoke:package`.
3. Require a successful nine-job hosted matrix for the exact approved source commit. Earlier runs do not validate a later commit.
4. Pack and inspect the artifact. Record the source SHA and tarball SHA-512 outside the package; validate the isolated installed package, executable, examples and ESM/TypeScript imports.
5. Only after approval, use the maintainer's authenticated release process with interactive 2FA or a separately reviewed trusted publisher. Never store credentials in this repository. No publishing workflow is provided here.
6. Verify the published tag/source SHA, GitHub assets and registry integrity against the approved artifact. Test a clean registry consumer, then record the date, URLs, CI run and verification limits.

See [verification](verification.md) for historical results and the [release notes](releases/v1.0.0.md) for v1.0.0 behavior.
