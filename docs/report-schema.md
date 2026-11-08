# JSON report v2

The [machine schema](schemas/report.schema.json) and the exported `Report` type use `version: 2`. The `fingerprintVersion` remains `awi-sha256-v1`. The envelope also includes `complete`, `summaries`, `findings`, and `warnings`. Optional `content` requires explicit opt-in. Reports contain no generation timestamp or absolute input path.

Summaries include `traceId`, `operations`, `toolCalls`, `maxDepth`, and, when available, `durationMs` and recorded leaf `usage`. Findings include `ruleId`, `severity`, `confidence`, `title`, `description`, `explanation`, `remediation`, `traceId`, `operationIds`, and structured `evidence`. `evidence.references` repeats the operation aliases and includes the adapter's source format and index when available. A source index describes recorded order in its input, which can repeat across merged files. AWI005 is trace-wide and has empty operation and reference lists.

`traceId` uses `trace-N`. `operationIds` and `evidence.references[].operationId` use `op-N`. Join on `traceId` within a report and on the pair `(traceId, operationId)` for operation references. Ordinals start at 1 and follow the lexical order of recorded trace IDs and the recorded operation IDs within each merged trace. They can shift when inputs are added, removed, or renamed. Findings retain descending severity and the existing lexical order of underlying trace IDs, rule IDs, and operation ID lists. Source indices still depend on the order in the original export. Warnings deduplicate and sort.

```json
{
  "version": 2,
  "fingerprintVersion": "awi-sha256-v1",
  "complete": true,
  "summaries": [
    { "traceId": "trace-1", "operations": 0, "toolCalls": 0, "maxDepth": 0 }
  ],
  "findings": [],
  "warnings": []
}
```

`complete: false` indicates truncation and produces a CLI operational failure. Eligibility warnings identify unavailable timing or argument evidence. Consumers should use structured fields for integrations and allow additive evidence fields.

## Migrating from v1

- Update consumers to recognize `version: 2`. The v2 validator rejects v1, and v1 validators reject v2. Trace input and configuration versions are independent of the report version.
- Replace joins to raw input IDs with report-local joins. For private debugging, `--show-content` and `analyze(traces, config, true)` add `content[].recordedTraceId` alongside the report alias `content[].traceId`. The normalized operation at zero-based index `N - 1` in `content[].operations` corresponds to `op-N` and contains the recorded ID, subject to output sanitization. Findings and summaries keep the same aliases. See [privacy limits](security.md).
- AWI006 `evidence.recordedCosts` groups amounts by `currency-N` in lexical order of recorded currency labels within the finding. These aliases have finding-local scope.
- AWI007 remains disabled by default. Once enabled, it reports `failedCalls`, `distinctArgumentFingerprints` and `references`, with operation IDs in run order. V2 omits `toolName` and `errorCode` from evidence even when recorded content is enabled.
