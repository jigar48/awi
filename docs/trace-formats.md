# Trace formats

## AWI JSON v1

A trace is `{version:1, traceId:string, metadata?:object, operations:Operation[]}`. A collection is `{version:1, traces:Trace[]}`. Unknown fields fail validation; use metadata for extensions. See the [single-trace schema](schemas/trace.schema.json); ingest validates the collection wrapper separately.

Required operation fields: id, type, name. Types: tool, agent, model, workflow, generic. Status: ok, error, unknown (default). Optional fields: parentId, toolName, startTime, endTime, error:{code?,message?}, arguments (any JSON), resultMetadata, usage:{inputTokens?,outputTokens?,totalTokens?}, cost:{amount,currency}, metadata.

Times are offset-bearing ISO-8601 strings, optional independently, with at most nine fractional-second digits. Ordering and overlap use exact nanosecond comparisons; summary duration is a floating-point millisecond measurement. Duration is derived only with both endpoints; end-before-start fails. Trace duration is reported only if all operations have both endpoints. Token counts are nonnegative safe integers; cost is a finite nonnegative amount with a three-letter uppercase currency. Missing resources stay absent; recorded zero stays zero. IDs are nonempty and unique per trace. Missing parents warn and yield lower-bound depth; cycles and duplicates fail. Root depth is 1, empty trace depth 0. Generic operations remain in structure/counts.

## OTLP JSON subset

Accepts protobuf JSON-shaped resourceSpans[].scopeSpans[].spans[]. Does not accept JSONL, legacy instrumentationLibrarySpans, binary protobuf, collector envelopes or proprietary framework exports. Trace IDs are nonzero 32-digit hex; span/parent IDs are 16-digit hex, lowercased. Empty/all-zero parent means root. Missing trace/span IDs fail. Missing scopeSpans/spans are empty; malformed arrays fail.

| Input                                                                     | Canonical mapping                                                                                     |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| traceId, spanId, parentSpanId, name                                       | identity, parent, name                                                                                |
| startTimeUnixNano / endTimeUnixNano                                       | ISO times retaining nanosecond precision; decimal strings; numbers must be safe integers              |
| status.code 1 / STATUS_CODE_OK                                            | ok                                                                                                    |
| status.code 2 / STATUS_CODE_ERROR                                         | error                                                                                                 |
| absent, 0, unrecognized status                                            | unknown                                                                                               |
| gen_ai.tool.name or tool.name                                             | toolName and tool classification                                                                      |
| gen_ai.operation.name = execute_tool                                      | tool                                                                                                  |
| invoke_agent                                                              | agent                                                                                                 |
| chat, generate_content, text_completion, embeddings                       | model                                                                                                 |
| workflow                                                                  | workflow                                                                                              |
| unrecognized operation                                                    | generic                                                                                               |
| gen_ai.tool.call.arguments                                                | arguments; JSON strings parsed if valid, otherwise string preserved                                   |
| gen_ai.usage.input_tokens / output_tokens / total_tokens                  | separately recorded nonnegative safe integer usage                                                    |
| exception event: exception.type / exception.message; error status.message | error code/message; status message is a fallback; exception alone does not promote unknown to failure |
| resource attributes, scope, attributes, events                            | preserved metadata                                                                                    |

Tool name takes precedence over operation classification. No span-name guessing. No results, costs, or usage are invented. AnyValue supports stringValue, boolValue, intValue, doubleValue, bytesValue, arrayValue.values, kvlistValue.values. Integer AnyValues must be signed 64-bit decimal strings or safe integer JSON numbers. Large values outside the safe numeric range stay strings and cannot become usage. Malformed known AnyValue encodings fail; empty or unknown encodings are omitted rather than turned into tool arguments. Arrays/objects with unknown members are not used as argument identity evidence. No type coercion fabricates usage.

These are limited GenAI semantic-convention assumptions, not universal compatibility. Instrumentation can use different attributes or omit arguments; inspect warnings or explicitly convert to AWI JSON. No framework integration has been certified. Positive-duration nanosecond spans retain their precision; truly zero-duration groups are excluded conservatively. Attributes/events remain in memory and are absent from default reports.

Auto-detection requires exactly one recognizable AWI/OTLP root. Otherwise specify input-format or fix the export. Malformed required data fails as a unit rather than silently dropping spans.

Resource attributes are decoded once per resourceSpans entry. Raw and normalized structures each have a bounded node budget; exports with extreme shared-metadata amplification fail explicitly. Binary AnyValues remain opaque base64 metadata and are not interpreted as tool/operation names, errors or argument identity. Unknown duplicate attributes clear earlier evidence rather than reviving stale values. Timestamp zero means missing; negative/out-of-uint64 timestamps fail. Unknown attributes remain outside classification; this subset does not certify every semantic-convention revision.

For missing or empty span names, the display label is unnamed and metadata awi.operation_name_recorded is false. An explicit execute_tool span still counts as a tool, but identity rules exclude it unless an actual tool name or recorded operation name is available. The display placeholder never establishes tool identity.
