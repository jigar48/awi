# Detection rules

Diagnostics separate observed evidence from heuristic explanation. High evidence means recorded equivalence/failure or policy counts are directly established. Moderate means pattern/association inference. Categories are not statistical probabilities; no rule establishes intent, actual defects or wasted money.

Identity rules require recorded arguments (null is present), positive-duration timed siblings under one parent, and non-overlap. Untimed/zero-duration groups cannot establish sequences and are excluded. Missing arguments interrupt tool segments. Overlaps split runs; unrelated traces/parents never combine. Incomplete exports can therefore hide genuine problems.

| ID     | Default criterion                                                                             | Limitations                                                                       |
| ------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| AWI001 | Same fingerprint at least 4 times in disjoint 100-call window                                 | Intentional polling matches; window boundaries can miss repetition                |
| AWI002 | 3 same-fingerprint explicit errors with matching error object; code or message required       | Different failure text splits equivalence; unknown is not failure                 |
| AWI003 | Contiguous cycle length 2–6 repeating 3 times, at least two distinct fingerprints             | Shortest matching period wins; consumed cycles not rescanned                      |
| AWI004 | 5 equivalent attempts in 30 seconds from first attempt, every prior attempt explicitly failed | Retry intent inferred; successes, unknown status and slow attempts do not qualify |
| AWI005 | More than 100 total operations OR observed depth over 20                                      | One trace-wide finding, not a tool-count limit; complexity is not a defect        |
| AWI006 | Recorded usage or cost on implicated leaf operations from AWI001–004                          | Direct association only; no inferred price or unrelated model attribution         |

AWI001/002/004 use disjoint 100-call windows after segmentation; AWI004 accepts disjoint time groups within each fingerprint group. Boundary-spanning patterns may be missed. AWI003 scans the full eligible segment, with configurable length capped at 16. Single-fingerprint repetition is AWI001/002 rather than a cycle.

## Interactions

AWI002 suppresses AWI001 for its exact covered failure operations. Remaining repeated operations can qualify separately. AWI004 can coexist with AWI002: rapid failed attempts and matching failure outcomes provide distinct evidence. AWI003 adds ordering evidence. One AWI006 per trace unions related IDs and counts each leaf once. AWI005 uses empty operationIds for trace-wide evidence.

## Resource accounting

Summaries sum recorded leaf usage, excluding parent aggregates. Input/output/total fields are independently summed and never added to each other. Cost sums remain separate per currency. AWI006 uses only implicated leaves, never nearby/enclosing model spans. Missing resources remain absent. Explicit zero is valid recorded evidence. Parent-only usage is omitted conservatively, so absence of AWI006 does not imply free execution. Wall duration is not CPU time or wasted time.

## Limits

16 MiB/file; 64 MiB aggregate CLI inputs; 256 files; 2,048 directory entries; directory depth 16; 50,000 total operations; JSON depth 64; 65,536 UTF-16 code units/string or key; 1,000,000 JSON values/document; 1,000 findings. Structural limits fail with exit 1. Finding overflow returns complete:false, warning, exit 1 even with fail-on none. At most 100 fingerprint paths. Config schemas bound thresholds/windows/cycle lengths. A 50,000-span test uses a generous 15-second regression ceiling, not a cross-hardware benchmark claim.
