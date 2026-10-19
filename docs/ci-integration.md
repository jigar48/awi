# CI integration

AWI does not upload traces. Supply local synthetic/recorded JSON from your own job and treat reports as potentially sensitive.

```yaml
- uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6
  with:
    node-version: '24'
- uses: pnpm/action-setup@a8198c4bff370c8506180b035930dea56dbd5288 # v5
- run: pnpm install --frozen-lockfile
- run: pnpm build
- run: node dist/cli/index.js inspect ./traces --format json --fail-on high --output awi-report.json
```

Repository CI is configured to check Node 22/24/26 on Windows/Linux/macOS with typecheck, lint, tests, build, format, schema drift, production audit and packaging. Local Windows and Linux WSL checks do not prove the hosted matrix outcomes; macOS remains unverified. Workflow actions are pinned to verified upstream commits using Node 24; checkout does not persist credentials. Permissions are read-only and nothing is published.

Exit 1 takes precedence over finding thresholds: structural errors prevent a report; truncation emits incomplete JSON and exits 1. Exit 2 means completed analysis meets severity. fail-on none never masks errors. Warnings are structured in JSON, not mixed into stdout. Missing evidence is documented even when all applicable rules complete.
