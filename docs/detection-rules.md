# Detection rules

Diagnostics separate observed evidence from heuristic explanation. High evidence means recorded equivalence/failure or policy counts are directly established. Moderate means pattern/association inference. Categories are not statistical probabilities; no rule establishes intent, actual defects or wasted money.

Identity rules require recorded tool/operation identity (not an adapter display placeholder), recorded arguments (null is present), positive-duration timed siblings under one parent, and non-overlap. Untimed/zero-duration groups cannot establish sequences and are excluded. Known model/generic spans are projected out of tool sequences, while their timing still constrains overlap and eligibility. Missing tool arguments/identity interrupt tool segments. All members of overlapping clusters are excluded, splitting runs; unrelated traces/parents never combine. Incomplete exports can therefore hide genuine problems.

| ID     | Default criterion                                                                                | Limitations                                                                       |
| ------ | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| AWI001 | Same fingerprint at least 4 times in disjoint 100-call window                                    | Intentional polling matches; window boundaries can miss repetition                |
| AWI002 | 3 same-fingerprint explicit errors with matching error object; nonblank code or message required | Different failure text splits equivalence; unknown is not failure                 |
| AWI003 | Contiguous cycle length 2–6 repeating 3 times, at least two distinct fingerprints                | Shortest matching period wins; consumed cycles not rescanned                      |
| AWI004 | 5 equivalent attempts in 30 seconds from first attempt, every prior attempt explicitly failed    | Retry intent inferred; successes, unknown status and slow attempts do not qualify |
| AWI005 | More than 100 total operations OR observed depth over 20                                         | One trace-wide finding, not a tool-count limit; complexity is not a defect        |
| AWI006 | Recorded usage or cost on implicated leaf operations from AWI001–004 or enabled AWI007           | Direct association only; no inferred price or unrelated model attribution         |

AWI001/002/004 use disjoint 100-call windows after segmentation; AWI004 accepts disjoint time groups within each fingerprint group, ending a retry chain at its first non-error outcome. Later attempts cannot erase an earlier qualifying storm. Boundary-spanning patterns may be missed. AWI003 scans the full eligible segment, with configurable length capped at 16. Single-fingerprint repetition is AWI001/002 rather than a cycle.

## Interactions

AWI002 suppresses AWI001 for its exact covered failure operations. Remaining repeated operations can qualify separately. AWI004 can coexist with AWI002: rapid failed attempts and matching failure outcomes provide distinct evidence. AWI003 adds ordering evidence. One AWI006 per trace unions related IDs and counts each leaf once. AWI005 uses empty operationIds for trace-wide evidence.

## Resource accounting

Summaries sum recorded leaf usage, excluding parent aggregates. Input/output/total fields are independently summed and never added to each other. Cost sums remain separate per currency. AWI006 uses only implicated leaves, never nearby/enclosing model spans. Missing resources remain absent. Explicit zero is valid recorded evidence. Parent-only usage is omitted conservatively, so absence of AWI006 does not imply free execution. Wall duration is not CPU time or wasted time.

## Limits

16 MiB/file; 64 MiB aggregate CLI inputs; 256 files; 2,048 directory entries; directory depth 16; 50,000 total operations; 50,000 traces; JSON depth 64; 65,536 UTF-16 code units/string or key; 1,000,000 JSON values and a 64 MiB escaped-content budget per raw or normalized structure (shared values count per occurrence); 1,000 findings. Structural limits fail with exit 1. Default report data is subject to the same node/content budget before serialization; excessive evidence amplification fails with an explicit report-limit error rather than attempting unbounded output. Finding overflow returns complete:false, warning, exit 1 even with fail-on none. At most 100 fingerprint paths. Config schemas bound thresholds/windows/cycle lengths. A 50,000-span test uses a generous 15-second regression ceiling, not a cross-hardware benchmark claim.

## AWI007: Repeated failure with argument drift

Opt-in; medium severity, moderate confidence. Requires at least four consecutive eligible tool failures in one trace and parent, the same toolName (fallback name), an exactly matching nonblank explicit error code, and at least three distinct existing v1 fingerprints. No case folding or semantic argument comparison occurs. Fingerprint ignore paths apply. Missing arguments, unknown identity, missing/blank codes, success, unknown status, or a different tool/code interrupt a sequence. Non-tool siblings constrain timing but are projected out, as with existing sequence rules. Missing/zero-duration sibling timing excludes the sibling group; overlapping operations split runs and are excluded.

One finding covers each maximal qualifying run, without sliding-window duplicates. Thresholds are minimum counts, not fixed window sizes. The scan adds linear time and memory after existing timing sorting, bounded by the 50,000-operation input limit and existing report budgets.

AWI002 compares equivalent arguments and complete recorded error objects; AWI004 counts rapid equivalent attempts after failures within its time window. AWI007 requires varying fingerprints and a shared error code, without a retry-time window. Messages may differ and are never used by AWI007. Other rules may independently report the same operations; AWI006 can associate recorded leaf resources when AWI007 is enabled.

Legitimate parameter exploration, validation attempts, pagination, and fallback strategies can match. Repeated recorded failures do not prove a lack of progress or reveal intent. Review the error code and retry policy before deciding whether to bound retries or escalate.
