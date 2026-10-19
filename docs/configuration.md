# Configuration

Use --config path.json. No automatic home lookup, executable settings, remote loading or environment substitution. Partial objects receive deterministic defaults. Unknown keys, versions, unsafe paths and invalid thresholds fail. See [example](../awi.config.example.json) and [schema](schemas/config.schema.json).

Version 1; every rule supports enabled. AWI001/002 threshold 2–1,000 (defaults 4/3). AWI003 minRepetitions 2–100 (default 3), maxCycleLength 2–16 (default 6). AWI004 threshold 2–1,000 (default 5), windowSeconds 1–3,600 (default 30). AWI005 maxOperations 1–50,000 (default 100), maxDepth 1–1,000 (default 20). AWI006 reports recorded association, so needs no spending threshold.

fingerprint.ignorePaths accepts at most 100 dot-separated ASCII identifiers, e.g. metadata.trace_id, applied to arguments only, with at most 64 path segments. Arrays preserve order and are not traversed by ignore paths. The public canonicalize/fingerprint helpers enforce the same path syntax. No wildcards, expressions, indices, `constructor`, `prototype` or `__proto__`. Missing ignored paths have no effect. Literal dotted JSON keys do not match nested paths. IDs and timestamps are never automatically ignored.

## Fingerprint v1

awi-sha256-v1 hashes operation type, toolName (fallback name), argument presence and canonical argument JSON. Keys sort lexically by UTF-16 code unit. Arrays keep order, JSON types remain distinct, missing differs from null. Unicode has no normalization. Numbers use finite JavaScript double semantics: -0 becomes 0; large numeric integers may lose precision, so encode precision-sensitive integers as strings. Duplicate keys follow JSON.parse last-value-wins before hashing. Unsupported values (BigInt, undefined as a value, functions, class instances, sparse arrays, symbol keys, accessors), nonfinite numbers, unsafe keys and oversized structures fail. There is no executable canonicalizer.

Generated canonical JSON is not subject to the per-input-string limit; argument objects containing multiple individually valid strings remain supported within the content budget. The v1 byte contract is unchanged. Ignored paths are compiled into bounded maps, safely reused while unchanged, and never matched by repeatedly serializing full ancestor paths.

Identical fingerprints mean identical recorded values under these rules, not identical effects. Hashes are sensitive correlators, not anonymization, and are absent from ordinary reports.
