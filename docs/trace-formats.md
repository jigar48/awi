# Trace formats

## AWI JSON v1

A trace is `{version:1, traceId:string, metadata?:object, operations:Operation[]}`. A collection is `{version:1, traces:Trace[]}`. Unknown fields fail validation; use metadata for extensions. See [schema](schemas/trace.schema.json).

Required operation fields: id, type, name. Types: tool, agent, model, workflow, generic. Status: ok, error, unknown (default). Optional fields: parentId, toolName, startTime, endTime, error:{code?,message?}, arguments (any JSON), resultMetadata, usage:{inputTokens?,outputTokens?,totalTokens?}, cost:{amount,currency}, metadata.

Times are offset-bearing ISO-8601 strings, optional independently. Duration is derived only with both endpoints; end-before-start fails. Trace duration is reported only if all operations have both endpoints. Token counts are nonnegative safe integers; cost is a finite nonnegative amount with a three-letter uppercase currency. Missing resources stay absent; recorded zero stays zero. IDs are nonempty and unique per trace. Missing parents warn and yield lower-bound depth; cycles and duplicates fail. Root depth is 1, empty trace depth 0. Generic operations remain in structure/counts.

## OTLP JSON subset

Accepts protobuf JSON-shaped resourceSpans[].scopeSpans[].spans[]. Does not accept JSONL, legacy instrumentationLibrarySpans, binary protobuf, collector envelopes or proprietary framework exports. Trace IDs are nonzero 32-digit hex; span/parent IDs are 16-digit hex, lowercased. Empty/all-zero parent means root. Missing trace/span IDs fail. Missing scopeSpans/spans are empty; malformed arrays fail.

| Input                                                    | Canonical mapping                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------- |
| traceId, spanId, parentSpanId, name                      | identity, parent, name                                              |
| startTimeUnixNano / endTimeUnixNano                      | ISO times truncated to milliseconds; decimal strings preferred      |
| status.code 1 / STATUS_CODE_OK                           | ok                                                                  |
| status.code 2 / STATUS_CODE_ERROR                        | error                                                               |
| absent, 0, unrecognized status                           | unknown                                                             |
| gen_ai.tool.name or tool.name                            | toolName and tool classification                                    |
| gen_ai.operation.name = execute_tool                     | tool                                                                |
| invoke_agent                                             | agent                                                               |
| chat, generate_content, text_completion, embeddings      | model                                                               |
| workflow                                                 | workflow                                                            |
| unrecognized operation                                   | generic                                                             |
| gen_ai.tool.call.arguments                               | arguments; JSON strings parsed if valid, otherwise string preserved |
| gen_ai.usage.input_tokens / output_tokens / total_tokens | separately recorded nonnegative safe integer usage                  |
| exception event: exception.type / exception.message      | error code/message, without promoting unknown status to failure     |
| resource attributes, scope, attributes, events           | preserved metadata                                                  |

Tool name takes precedence over operation classification. No span-name guessing. No results, costs, or usage are invented. AnyValue supports stringValue, boolValue, intValue, doubleValue, bytesValue, arrayValue.values, kvlistValue.values. Large intValue outside safe range stays a string and cannot become usage. Unknown AnyValue encodings become null metadata; no usage inferred.

These are limited GenAI semantic-convention assumptions, not universal compatibility. Instrumentation can use different attributes or omit arguments; inspect warnings or explicitly convert to AWI JSON. No framework integration has been certified. Millisecond precision can collapse short spans; zero-duration groups are excluded conservatively. Attributes/events remain in memory and are absent from default reports.

Auto-detection requires exactly one recognizable AWI/OTLP root. Otherwise specify input-format or fix the export. Malformed required data fails as a unit rather than silently dropping spans.
