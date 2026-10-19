# Limitations

Rules evaluate recorded facts and bounded heuristics, not intention or correctness. Polling/retries/cycles may be intentional. Missing arguments/timing, zero durations, overlaps, missing parent structure and instrumentation differences can hide patterns. Missing parents yield lower-bound depth. Neither graph structure nor temporal order establishes causality.

Disjoint 100-call windows can miss boundary-spanning repetition. Cycles are exact, contiguous and bounded. Different arguments do not semantically match. No LLM, embeddings, live tracing or distributed causal reconstruction. Failure comparison is exact recorded-object matching.

Only recorded leaf resources are counted. Parent aggregates and unrelated model usage are not attributed. Separate leaves can still duplicate values in poorly instrumented exports; absent accounting semantics cannot be recovered. Costs are explicit, currencies never mixed, wall duration never labeled waste.

OTLP support is the documented subset, not every export/framework. Duplicate JSON keys are last-wins; numbers use double precision. Strings preserve large integers exactly. Timestamp normalization loses submillisecond precision.

Local Windows checks do not establish macOS/Linux or alternate Node compatibility; CI must run. Regression timing is not a universal speed promise. Trusted directories are required against filesystem replacement races. Report publication requires hard-link support. Opt-in key-based redaction is not general anonymization.
