import { z } from 'zod';
import { timeNanoseconds } from './timestamps.js';
import { traceSchema } from '../adapters/index.js';
import { resolveConfig } from '../config/index.js';
import { AwiError, LIMITS, redact, validateValue } from '../security/index.js';
import { fingerprint, hash } from './fingerprinting.js';
import { normalize, sequentialRuns } from './normalization.js';
import type { Operation, Report, RuleId, Severity, Trace } from './models.js';
export const severityRank: Record<Severity, number> = {
  low: 1,
  medium: 2,
  high: 3,
};
const titles: Record<RuleId, string> = {
  AWI001: 'Repeated identical tool call',
  AWI002: 'Repeated identical failing tool call',
  AWI003: 'Repeating execution cycle',
  AWI004: 'Retry storm',
  AWI005: 'Excessive execution steps or depth',
  AWI006: 'Recorded resource usage associated with suspicious execution',
};
export function analyze(
  traces: Trace[],
  configInput: unknown = {},
  showContent = false,
): Report {
  const config = resolveConfig(configInput);
  validateValue(traces, true);
  if (!Array.isArray(traces) || traces.length > LIMITS.traces)
    throw new AwiError('Invalid or oversized trace collection');
  const analysisTraceSchema = traceSchema.extend({
    operations: z
      .array(
        traceSchema.shape.operations.element.extend({
          source: z
            .strictObject({
              format: z.enum(['awi', 'otel']),
              index: z
                .number()
                .int()
                .nonnegative()
                .max(Number.MAX_SAFE_INTEGER),
            })
            .optional(),
        }),
      )
      .max(LIMITS.spans),
  });
  const validated: Trace[] = [];
  let total = 0;
  for (const trace of traces) {
    if (!trace || !Array.isArray(trace.operations))
      throw new AwiError('Invalid canonical trace supplied to analysis');
    total += trace.operations.length;
    if (total > LIMITS.spans)
      throw new AwiError('Maximum total span count exceeded');
    const result = analysisTraceSchema.safeParse({
      ...trace,
      operations: trace.operations.map((op) =>
        op && typeof op === 'object'
          ? Object.fromEntries(
              Object.entries(op).filter(([, value]) => value !== undefined),
            )
          : op,
      ),
    });
    if (!result.success)
      throw new AwiError('Invalid canonical trace supplied to analysis');
    // Known optional fields may be explicitly undefined in native TypeScript callers.
    if (result.data.metadata === undefined) delete result.data.metadata;
    for (const op of result.data.operations) {
      if (op.error)
        op.error = Object.fromEntries(
          Object.entries(op.error).filter(([, value]) => value !== undefined),
        );
      if (op.usage)
        op.usage = Object.fromEntries(
          Object.entries(op.usage).filter(([, value]) => value !== undefined),
        );
    }
    validateValue(result.data);
    validated.push(result.data);
  }
  const report: Report = {
    version: 1,
    fingerprintVersion: 'awi-sha256-v1',
    complete: true,
    summaries: [],
    findings: [],
    warnings: [],
  };
  const grouped = new Map<string, Trace>();
  for (const t of validated) {
    const existing = grouped.get(t.traceId);
    if (existing) for (const op of t.operations) existing.operations.push(op);
    else grouped.set(t.traceId, { ...t, operations: [...t.operations] });
  }
  let capped = false;
  function add(
    ruleId: RuleId,
    traceId: string,
    ops: Operation[],
    evidence: Record<string, unknown>,
    explanation: string,
    confidence: 'high' | 'moderate' = 'moderate',
  ) {
    if (report.findings.length >= LIMITS.findings) {
      capped = true;
      return;
    }
    report.findings.push({
      ruleId,
      traceId,
      severity: ruleId === 'AWI002' || ruleId === 'AWI004' ? 'high' : 'medium',
      confidence,
      title: titles[ruleId],
      description:
        'Heuristic finding based on recorded execution evidence; intentional behavior may match.',
      explanation,
      remediation:
        'Review the referenced operations and configured policy before changing the workflow.',
      operationIds: ops.map((o) => o.id),
      evidence: {
        ...evidence,
        references: ops.map((op) => ({
          operationId: op.id,
          ...(op.source
            ? { source: { format: op.source.format, index: op.source.index } }
            : {}),
        })),
      },
    });
  }
  for (const trace of [...grouped.values()].sort((a, b) =>
    a.traceId < b.traceId ? -1 : a.traceId > b.traceId ? 1 : 0,
  )) {
    trace.operations.sort((a, b) => compare(a.id, b.id));
    const normalized = normalize(trace);
    report.warnings.push(...normalized.warnings);
    const starts = trace.operations.flatMap((o) =>
        o.startTime ? [timeNanoseconds(o.startTime)] : [],
      ),
      ends = trace.operations.flatMap((o) =>
        o.endTime ? [timeNanoseconds(o.endTime)] : [],
      );
    const leaves = trace.operations.filter(
      (o) => !normalized.children.has(o.id),
    );
    const usage: NonNullable<Operation['usage']> = {};
    for (const key of ['inputTokens', 'outputTokens', 'totalTokens'] as const) {
      const values = leaves.flatMap((o) =>
        o.usage?.[key] !== undefined ? [o.usage[key]!] : [],
      );
      if (values.length) {
        const total = values.reduce((a, b) => a + b, 0);
        if (!Number.isSafeInteger(total))
          throw new AwiError(
            'Recorded token aggregate exceeds safe integer range',
          );
        usage[key] = total;
      }
    }
    report.summaries.push({
      traceId: trace.traceId,
      operations: trace.operations.length,
      toolCalls: trace.operations.filter((o) => o.type === 'tool').length,
      maxDepth: normalized.depth,
      ...(starts.length === trace.operations.length &&
      ends.length === trace.operations.length &&
      starts.length
        ? {
            durationMs:
              Number(
                ends.reduce((a, b) => (a > b ? a : b)) -
                  starts.reduce((a, b) => (a < b ? a : b)),
              ) / 1000000,
          }
        : {}),
      ...(Object.keys(usage).length ? { usage } : {}),
    });
    if (
      trace.operations.some(
        (o) => o.type === 'tool' && o.arguments === undefined,
      )
    )
      report.warnings.push(
        'Tool calls without recorded arguments excluded from identity-based rules.',
      );
    if (
      trace.operations.some((o) => o.type === 'tool' && !toolIdentityKnown(o))
    )
      report.warnings.push(
        'Tool calls without recorded tool identity excluded from identity-based rules.',
      );
    const before = report.findings.length;
    const fps = new Map(
      trace.operations
        .filter((o) => o.type === 'tool' && toolIdentityKnown(o))
        .map((o) => [o.id, fingerprint(o, config.fingerprint.ignorePaths)]),
    );
    for (const siblings of normalized.children.values()) {
      if (
        siblings.some(
          (o) =>
            !o.startTime ||
            !o.endTime ||
            timeNanoseconds(o.endTime) <= timeNanoseconds(o.startTime),
        )
      )
        report.warnings.push(
          'Sibling groups with missing or zero-duration timing excluded from sequence rules; recorded order does not establish sequential execution.',
        );
      const runs = sequentialRuns(siblings);
      if (
        runs.flat().length < siblings.length &&
        siblings.every(
          (o) =>
            o.startTime &&
            o.endTime &&
            timeNanoseconds(o.endTime) > timeNanoseconds(o.startTime),
        )
      )
        report.warnings.push(
          'Overlapping sibling operations excluded from sequence rules.',
        );
      for (const run of runs) {
        // Project known tool calls; non-tool spans still constrain timing and parent context.
        let segment: Operation[] = [];
        const segments: Operation[][] = [];
        for (const op of run) {
          if (op.type !== 'tool') continue;
          if (op.arguments !== undefined && toolIdentityKnown(op))
            segment.push(op);
          else if (segment.length) {
            segments.push(segment);
            segment = [];
          }
        }
        if (segment.length) segments.push(segment);
        for (const tools of segments) {
          const groups = new Map<string, Operation[]>();
          // A bounded 100-operation window prevents distant repetitions accumulating forever.
          for (
            let base = 0;
            base < tools.length;
            base += LIMITS.repetitionWindow
          ) {
            groups.clear();
            for (const op of tools.slice(
              base,
              base + LIMITS.repetitionWindow,
            )) {
              const fp = fps.get(op.id)!;
              const group = groups.get(fp) ?? [];
              group.push(op);
              groups.set(fp, group);
            }
            for (const group of groups.values()) {
              const failures = new Map<string, Operation[]>();
              for (const op of group)
                if (
                  op.status === 'error' &&
                  (!!op.error?.code?.trim() || !!op.error?.message?.trim())
                ) {
                  const key = hash(op.error);
                  const bucket = failures.get(key) ?? [];
                  bucket.push(op);
                  failures.set(key, bucket);
                }
              const specific = new Set<string>();
              if (config.rules.AWI002.enabled)
                for (const bucket of failures.values())
                  if (bucket.length >= config.rules.AWI002.threshold) {
                    add(
                      'AWI002',
                      trace.traceId,
                      bucket,
                      {
                        occurrences: bucket.length,
                        identicalArguments: true,
                        equivalentFailureOutcomes: true,
                      },
                      'Equivalent recorded tool calls failed with matching error evidence. This does not establish a defective retry policy.',
                      'high',
                    );
                    bucket.forEach((o) => specific.add(o.id));
                  }
              const general = group.filter((o) => !specific.has(o.id));
              if (
                config.rules.AWI001.enabled &&
                general.length >= config.rules.AWI001.threshold
              )
                add(
                  'AWI001',
                  trace.traceId,
                  general,
                  { occurrences: general.length, identicalArguments: true },
                  'Identical calls occur in a bounded group of sequential sibling tool calls. Polling may be intentional.',
                  'high',
                );
              if (config.rules.AWI004.enabled) {
                let cursor = 0;
                while (cursor < group.length) {
                  const first = group[cursor]!;
                  let end = cursor + 1;
                  while (
                    end < group.length &&
                    group[end - 1]!.status === 'error' &&
                    timeNanoseconds(group[end]!.startTime!) -
                      timeNanoseconds(first.startTime!) <=
                      BigInt(config.rules.AWI004.windowSeconds) * 1000000000n
                  )
                    end++;
                  const attempts = group.slice(cursor, end);
                  if (
                    attempts.length >= config.rules.AWI004.threshold &&
                    attempts.slice(0, -1).every((o) => o.status === 'error')
                  ) {
                    add(
                      'AWI004',
                      trace.traceId,
                      attempts,
                      {
                        attempts: attempts.length,
                        windowSeconds: config.rules.AWI004.windowSeconds,
                        priorAttemptsExplicitlyFailed: true,
                      },
                      'Rapid equivalent attempts follow explicit failures; retry intent remains inferred.',
                    );
                    cursor = end;
                  } else cursor++;
                }
              }
            }
          }
          if (config.rules.AWI003.enabled) {
            const { maxCycleLength, minRepetitions } = config.rules.AWI003;
            for (let i = 0; i < tools.length;) {
              let consumed = 0;
              for (
                let length = 2;
                length <= maxCycleLength &&
                i + length * minRepetitions <= tools.length;
                length++
              ) {
                const pattern = tools
                  .slice(i, i + length)
                  .map((o) => fps.get(o.id)!);
                if (new Set(pattern).size < 2) continue;
                let repeats = 1;
                while (
                  i + (repeats + 1) * length <= tools.length &&
                  tools
                    .slice(i + repeats * length, i + (repeats + 1) * length)
                    .every((o, j) => fps.get(o.id) === pattern[j])
                )
                  repeats++;
                if (repeats >= minRepetitions) {
                  consumed = length * repeats;
                  add(
                    'AWI003',
                    trace.traceId,
                    tools.slice(i, i + consumed),
                    { cycleLength: length, repetitions: repeats },
                    'A bounded tool fingerprint sequence repeats among timed, non-overlapping siblings. Intent and causality are unknown.',
                  );
                  break;
                }
              }
              i += consumed || 1;
            }
          }
        }
      }
    }
    const policy = config.rules.AWI005;
    if (
      policy.enabled &&
      (trace.operations.length > policy.maxOperations ||
        normalized.depth > policy.maxDepth)
    )
      add(
        'AWI005',
        trace.traceId,
        [],
        {
          operations: trace.operations.length,
          maxDepth: normalized.depth,
          limits: { operations: policy.maxOperations, depth: policy.maxDepth },
        },
        'Observed workflow size exceeds configured policy; complexity alone is not a defect.',
        'high',
      );
    if (config.rules.AWI006.enabled) {
      const related = report.findings
        .slice(before)
        .filter((f) => f.ruleId !== 'AWI005');
      const implicated = new Set(related.flatMap((f) => f.operationIds));
      // Only implicated leaf spans: no attribution from an enclosing aggregate or unrelated model generation.
      const recorded = leaves.filter(
        (o) =>
          implicated.has(o.id) &&
          (Object.keys(o.usage ?? {}).length > 0 || o.cost),
      );
      if (recorded.length) {
        const tokens: Record<string, number> = {};
        const costs: Record<string, number> = {};
        for (const op of recorded) {
          for (const [key, n] of Object.entries(op.usage ?? {}))
            if (n !== undefined) tokens[key] = (tokens[key] ?? 0) + n;
          if (op.cost)
            costs[op.cost.currency] =
              (costs[op.cost.currency] ?? 0) + op.cost.amount;
          if (Object.values(costs).some((n) => !Number.isFinite(n)))
            throw new AwiError('Recorded cost aggregate exceeds numeric range');
        }
        add(
          'AWI006',
          trace.traceId,
          recorded,
          {
            recordedUsage: tokens,
            recordedCosts: costs,
            coverage:
              'Only implicated leaf operations with recorded usage or cost',
            relatedRules: [...new Set(related.map((f) => f.ruleId))],
          },
          'Recorded resources belong directly to operations in suspicious patterns. Association does not establish waste.',
        );
      }
    }
  }
  if (capped) {
    report.complete = false;
    report.warnings.push('Finding limit reached; report is truncated.');
  }
  report.findings.sort(
    (a, b) =>
      severityRank[b.severity] - severityRank[a.severity] ||
      compare(a.traceId, b.traceId) ||
      compare(a.ruleId, b.ruleId) ||
      compare(a.operationIds.join('\0'), b.operationIds.join('\0')),
  );
  report.warnings = [...new Set(report.warnings)].sort();
  try {
    validateValue(report);
  } catch (error) {
    if (error instanceof AwiError)
      throw new AwiError('Report exceeds resource limits');
    throw error;
  }
  if (showContent)
    report.content = [...grouped.values()]
      .sort((a, b) => compare(a.traceId, b.traceId))
      .map((t) => ({
        traceId: t.traceId,
        operations: redact(t.operations) as unknown[],
      }));
  return report;
}
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function toolIdentityKnown(op: Operation): boolean {
  return (
    op.source?.format !== 'otel' ||
    !!op.toolName ||
    op.metadata?.['awi.operation_name_recorded'] !== false
  );
}
