# Limitations

Rules evaluate recorded facts and bounded heuristics, not intention or correctness. Polling/retries/cycles may be intentional. Missing arguments/timing, zero durations, overlaps, missing parent structure and instrumentation differences can hide patterns. Missing parents yield lower-bound depth. Neither graph structure nor temporal order establishes causality. Timing rules assume comparable recorded clocks; AWI does not correct distributed clock skew.

Disjoint 100-call windows can miss boundary-spanning repetition. Cycles are exact, contiguous and bounded. Different arguments do not semantically match. No LLM, embeddings, live tracing or distributed causal reconstruction. Failure comparison is exact recorded-object matching.

Only recorded leaf resources are counted. Parent aggregates and unrelated model usage are not attributed. Separate leaves can still duplicate values in poorly instrumented exports; absent accounting semantics cannot be recovered. Costs use finite JSON/JavaScript number arithmetic, are explicit, and never mix currencies; they are not a billing ledger. Wall duration is never labeled waste.

OTLP support is the documented subset, not every export/framework. Duplicate JSON keys are last-wins; numbers use double precision. Strings preserve large integers exactly. Timestamp ordering retains up to nanosecond precision; duration summaries use floating-point milliseconds.

Windows and Ubuntu WSL checks do not establish macOS or hosted-runner compatibility; the full CI matrix must run. Regression timing is not a universal speed promise. Trusted directories remain required against concurrent replacement of parent components. Legitimate symlink paths, including package-manager aliases and some OS temporary paths, must be resolved to real paths before inspection. Report publication requires hard-link support. Opt-in key-based redaction is not general anonymization.

AWI007 is disabled by default. Legitimate argument exploration and fallback attempts may produce the same code repeatedly. Fingerprint differences do not measure semantic change or progress; ignored paths can hide differences. Exact error-code equality can miss equivalent failures with different codes. Missing codes/arguments/status/timing can hide runs. AWI007 emits maximal runs rather than using the disjoint repetition windows of AWI001/002/004.

AWI007 evidence contains the failure count, distinct fingerprint count and operation references. Its tool name and shared error code are used internally. `--show-content` can expose recorded identifiers, labels and argument content despite key-based redaction. See the [security and privacy documentation](security.md).
