# Getting started

Install the Node/pnpm versions listed in README, then run `pnpm install --frozen-lockfile` and `pnpm check`. Only dependency installation needs network access.

Run `node dist/cli/index.js --help` and `node dist/cli/index.js inspect --help`. Try examples/healthy/basic.json for a clean result, examples/suspicious/retries.json for a finding, and examples/opentelemetry/tools.json for OTLP ingestion. AWI analyzes exports, not live executions.

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
