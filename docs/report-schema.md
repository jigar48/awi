# JSON report v1

[Machine schema](schemas/report.schema.json). Fields: version 1, fingerprintVersion awi-sha256-v1, complete, summaries, findings, warnings. No clock or absolute paths. Optional content requires explicit opt-in.

Summary fields: traceId, operations, toolCalls, maxDepth, optional durationMs and recorded leaf usage. Unknown resources stay absent. Finding fields: ruleId, severity, confidence, title, description, explanation, remediation, traceId, operationIds, structured evidence. References contain operationId and adapter source format/index when available. traceId + operationId is authoritative across merged files; source index preserves adapter recorded order, not causal order. AWI005 is trace-wide with no individual operation list.

Findings sort by descending severity, trace ID, rule ID, then operation ID list using lexical comparison. Warnings deduplicate and sort. CLI filesystem inputs enumerate deterministically. Operations and resource evidence use stable ID ordering after ingestion; timing rules use exact timestamps. Adapter source indices retain recorded order, so ingesting a reordered raw export changes those evidence indices deliberately. Direct-library trace fragments produce the same findings regardless of fragment order.

```json
{
  "version": 1,
  "fingerprintVersion": "awi-sha256-v1",
  "complete": true,
  "summaries": [
    { "traceId": "demo", "operations": 0, "toolCalls": 0, "maxDepth": 0 }
  ],
  "findings": [],
  "warnings": []
}
```

complete:false means truncation and is never clean success. Eligibility warnings identify unavailable timing/argument evidence. Complete means all applicable analysis finished, not that absent information was reconstructed. Incompatible contracts require a version change. Evidence fields are rule-specific and additive; consumers should not parse prose.
