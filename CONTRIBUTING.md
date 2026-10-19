# Contributing

Use supported Node and pinned pnpm. Run pnpm install --frozen-lockfile, pnpm check and pnpm format:check. Add positive/negative behavior tests for detector changes and adversarial cases for security changes. Use only synthetic credential-free fixtures.

Changes to rule IDs, fingerprint identity, schema versions or exit codes require compatibility review and changelog entries. Update documentation and regenerate schemas with pnpm schemas. Check dependency engines and pnpm audit. Never weaken tests to accept defects.

Describe the problem, resulting behavior, limitations and verification in PRs. No automated publishing occurs. Maintainer approval is required for releases and remote actions.
