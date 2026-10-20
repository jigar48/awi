# CI integration

AWI analyzes local JSON and sends no telemetry. Use synthetic traces for examples; review reports before sharing because identifiers can contain sensitive data.

## Inside the AWI repository

After checkout, use the repository's pinned pnpm version and build its source:

```yaml
- uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6
  with:
    persist-credentials: false
- uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6
  with:
    node-version: '24.11.0'
    package-manager-cache: false
- uses: pnpm/action-setup@a8198c4bff370c8506180b035930dea56dbd5288 # v5
- run: pnpm install --frozen-lockfile
- run: pnpm build
- run: pnpm verify:quickstart
```

The verifier expects exit 0 for the healthy fixture and exit 2 with `AWI002`, `AWI004`, and `AWI006` for retries. It exits 0 only when both match, so expected findings do not fail the job.

Repository CI runs this verification alongside typecheck, lint, 69 tests, build, formatting, schema drift, production audit and package smoke checks on Windows/macOS/Linux × Node 22.18.0/24.11.0/26. Earlier hosted results are recorded in [verification](verification.md); a fresh matrix is needed for these changes.

## Inside another repository

Install the published CLI rather than expecting AWI's `dist/` and `examples/` paths in your application. Version 1.0.0 was confirmed in the [npm registry](https://registry.npmjs.org/agent-workflow-inspector/1.0.0) on October 20, 2026. The following steps assume your checkout contains `test-traces/` with supported JSON exports:

```yaml
- uses: actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6
  with:
    persist-credentials: false
- uses: actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6
  with:
    node-version: '24.11.0'
    package-manager-cache: false
- run: npm install --global --ignore-scripts agent-workflow-inspector@1.0.0
- run: awi inspect ./test-traces --format json --fail-on high --output awi-report.json
```

Set workflow permissions to `contents: read`. For lockfile-controlled dependencies, add AWI as an exact dev dependency in your application, commit its lockfile, and use your package manager's local executable instead of a global install.

The gate exits 0 below threshold, 2 for completed analysis meeting the threshold, or 1 for errors/incomplete analysis. `--fail-on none` never masks errors. Do not suppress exit 2 when you want findings to block CI. JSON warnings remain structured in stdout. `--output` requires a new filename in an existing directory; keep reports outside input directories and remove old reports before rerunning.
