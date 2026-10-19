# Agent Workflow Inspector (AWI)

**Find loops, retries, and wasted work in AI agent traces.**

AWI is a local, deterministic linter for recorded agent workflows. It reads versioned AWI JSON or a documented subset of OTLP JSON and produces evidence for local review or CI. Analysis requires no account, LLM, network, browser, or service.

Findings are heuristics, not proof of bugs or waste. Repeated polling and intentional retries can match. AWI does not infer agent intent or causal dependencies from timestamps.

## Run from source

Use Node **22.18+ (22.x), 24.11+ (24.x), or 26+** and pnpm **11.25.0**.

```sh
pnpm install --frozen-lockfile
pnpm check
node dist/cli/index.js inspect examples/healthy/basic.json
node dist/cli/index.js inspect examples/suspicious/retries.json --format json
node dist/cli/index.js inspect examples/opentelemetry/tools.json --input-format otel
```

The suspicious example exits 2 by default. For a local installation, run `pnpm pack --out agent-workflow-inspector-1.0.0.tgz`, then `pnpm add --global ./agent-workflow-inspector-1.0.0.tgz`. The package exposes the `awi` executable and an ESM TypeScript library.

This implementation has not been published. The npm registry returned 404 for `agent-workflow-inspector` on October 19, 2026; this neither reserves the name nor guarantees future availability.

## CLI

```sh
awi inspect trace.json --format human
awi inspect ./traces --format json --fail-on medium --output report.json
awi inspect first.json second.json --config awi.config.example.json
```

| Rule   | Default severity | Recorded pattern                                                   |
| ------ | ---------------- | ------------------------------------------------------------------ |
| AWI001 | medium           | Four equivalent tool calls in a bounded window                     |
| AWI002 | high             | Three equivalent failing calls with matching error evidence        |
| AWI003 | medium           | A cycle of 2–6 calls repeating three times                         |
| AWI004 | high             | Five rapid equivalent attempts, preceded by explicit failures      |
| AWI005 | medium           | More than 100 operations or parent depth over 20                   |
| AWI006 | medium           | Recorded leaf usage/cost directly associated with suspicious calls |

Exit codes: **0** completed below threshold; **1** invalid input/configuration, operational failure, or incomplete analysis; **2** completed with findings at or above threshold. Default threshold: high. `--fail-on none` disables finding-based failure.

Directories are recursive, bounded, deterministic, and restricted to JSON files. Symlinks and existing output paths are refused. Raw arguments, results, messages, prompts, and metadata are absent from ordinary reports. IDs remain visible for evidence; avoid putting secrets in identifiers. `--show-content` includes content with limited key-based redaction and can expose private data.

## Library

```ts
import { readFile } from 'node:fs/promises';
import { analyze, ingest, parseJson } from 'agent-workflow-inspector';

const traces = ingest(parseJson(await readFile('trace.json', 'utf8')));
const report = analyze(traces, { rules: { AWI001: { threshold: 5 } } });
console.log(report.findings);
```

Library and CLI share validators, limits, detectors, and report contracts. The library does no filesystem access or networking. Optional properties represent unknown values; they are never silently replaced with zero.

## Documentation

- [Getting started](docs/getting-started.md)
- [Trace formats and OTLP mapping](docs/trace-formats.md)
- [Detection rules](docs/detection-rules.md)
- [Configuration](docs/configuration.md)
- [Architecture and dependency choices](docs/architecture.md)
- [Security](docs/security.md)
- [CI integration](docs/ci-integration.md)
- [Report contract](docs/report-schema.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Limitations](docs/limitations.md)
- [Verification record](docs/verification.md)
- [Contributing](CONTRIBUTING.md)

MIT licensed. No framework-specific compatibility claims are made beyond the documented input mappings.
