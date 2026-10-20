# Getting started

Use Node.js **22.18+ within 22.x, 24.11+ within 24.x, or 26.x** and **pnpm 11.25.0**, matching `package.json`. Check `node --version` and `pnpm --version` first. If pnpm is missing, install the pinned version with `npm install --global pnpm@11.25.0` using a supported Node version.

From a new checkout (PowerShell, macOS, or Linux shell):

```sh
git clone https://github.com/jigar48/awi.git
cd awi
pnpm install --frozen-lockfile
pnpm build
pnpm verify:quickstart
```

This uses the checked-out source, including the verifier added after v1.0.0; the original release tag does not contain that script. For a reproducible repeat, record `git rev-parse HEAD` and use that commit. Clone, toolchain setup, and dependency installation need network access; build, verification, and analysis run locally with no telemetry.

Expected verification output:

```text
examples/healthy/basic.json: exit 0; rules none
examples/suspicious/retries.json: exit 2; rules AWI002, AWI004, AWI006
Quickstart verification passed.
```

The verifier runs the built CLI on synthetic, checked-in examples and itself exits 0 when both cases match. Rebuild after changing source. To run the CLI yourself:

```sh
node dist/cli/index.js --help
node dist/cli/index.js inspect examples/healthy/basic.json
node dist/cli/index.js inspect examples/suspicious/retries.json --format json
node dist/cli/index.js inspect examples/opentelemetry/tools.json --input-format otel
```

The retry and OTLP examples intentionally exit 2 at the default high threshold; a shell/CI job may stop there. Exit 1 means an operational error or incomplete analysis. `--fail-on none` disables finding-based failure only. AWI analyzes exports, not live executions.

For contributor checks, run `pnpm check` and `pnpm format:check`.

For use outside this checkout, `agent-workflow-inspector@1.0.0` is [published on npm](https://www.npmjs.com/package/agent-workflow-inspector/v/1.0.0) (verified October 20, 2026):

```sh
npm install --global agent-workflow-inspector@1.0.0
awi --version
awi --help
```

Save the following synthetic example as `trace.json`, then run `awi inspect trace.json` (exit 0). Checkout-relative `examples/` and `dist/` paths apply only inside AWI's source repository.

A minimal canonical trace is:

```json
{
  "version": 1,
  "traceId": "example",
  "operations": [
    {
      "id": "one",
      "type": "tool",
      "name": "lookup",
      "arguments": { "q": "demo" },
      "status": "ok",
      "startTime": "2026-01-01T00:00:00Z",
      "endTime": "2026-01-01T00:00:01Z"
    }
  ]
}
```

Supply several files or a directory. Files sharing traceId merge; duplicate operation IDs then fail validation. Distinct trace IDs never share sequence detection. Output is withheld on ordinary input failures.

Use --format json for tooling. --output must name a new file in an existing directory. Keep reports outside input directories, as they would be treated as traces on the next scan.
