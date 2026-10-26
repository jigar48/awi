import { describe, it, expect } from 'vitest';
import {
  analyze,
  resolveConfig,
  reportSchema,
  jsonReport,
  humanReport,
  LIMITS,
  type Operation,
  type Trace,
} from '../src/index.js';
const config = { rules: { AWI007: { enabled: true } } };
function calls(n = 4): Operation[] {
  return Array.from({ length: n }, (_, i) => ({
    id: 'o' + i,
    type: 'tool',
    name: 'search',
    arguments: { q: 'PRIVATE_ARGUMENT_' + i, password: 'SECRET' },
    status: 'error',
    error: { code: 'INVALID', message: 'PRIVATE_MESSAGE_' + i },
    startTime: new Date(1700000000000 + i * 1000).toISOString(),
    endTime: new Date(1700000000500 + i * 1000).toISOString(),
  }));
}
const trace = (operations: Operation[], traceId = 'drift'): Trace => ({
  version: 1,
  traceId,
  operations,
});
const findings = (operations: Operation[], settings: unknown = config) =>
  analyze([trace(operations)], settings).findings.filter(
    (f) => f.ruleId === 'AWI007',
  );
describe('AWI007', () => {
  it('reports four failures with exact evidence, moderate confidence and remediation', () => {
    const result = findings(calls());
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      severity: 'medium',
      confidence: 'moderate',
      operationIds: ['o0', 'o1', 'o2', 'o3'],
      evidence: {
        toolName: 'search',
        failedCalls: 4,
        distinctArgumentFingerprints: 4,
        errorCode: 'INVALID',
      },
    });
    expect(result[0]!.remediation).toContain('bounded retries');
  });
  it('accepts three distinct fingerprints among four calls', () => {
    const ops = calls();
    ops[3]!.arguments = ops[0]!.arguments;
    expect(findings(ops)).toHaveLength(1);
  });
  it('rejects three failures', () => expect(findings(calls(3))).toEqual([]));
  it('rejects identical arguments', () => {
    const ops = calls();
    ops.forEach((o) => (o.arguments = { q: 1 }));
    expect(findings(ops)).toEqual([]);
  });
  it('is disabled by default, including partial settings', () => {
    expect(findings(calls(), {})).toEqual([]);
    expect(findings(calls(), { rules: { AWI007: { threshold: 4 } } })).toEqual(
      [],
    );
    expect(resolveConfig().rules.AWI007).toEqual({
      enabled: false,
      threshold: 4,
      minDistinctArguments: 3,
    });
  });
  it.each([
    'success',
    'unknown',
    'missing arguments',
    'missing code',
    'blank code',
    'different code',
    'different tool',
    'different parent',
    'missing identity',
  ] as const)('breaks on %s', (kind) => {
    const ops = calls(7),
      middle = ops[3]!;
    switch (kind) {
      case 'success':
        middle.status = 'ok';
        break;
      case 'unknown':
        middle.status = 'unknown';
        break;
      case 'missing arguments':
        delete middle.arguments;
        break;
      case 'missing code':
        middle.error = { message: 'PRIVATE_MESSAGE' };
        break;
      case 'blank code':
        middle.error = { code: '  ' };
        break;
      case 'different code':
        middle.error = { code: 'OTHER' };
        break;
      case 'different tool':
        middle.toolName = 'other';
        break;
      case 'different parent':
        ops.forEach((o, i) => (o.parentId = String(Math.floor(i / 3))));
        break;
      case 'missing identity':
        middle.source = { format: 'otel', index: 3 };
        middle.metadata = { 'awi.operation_name_recorded': false };
        break;
    }
    expect(findings(ops)).toEqual([]);
  });
  it('does not combine traces', () => {
    const ops = calls(6);
    expect(
      analyze(
        [trace(ops.slice(0, 3), 'a'), trace(ops.slice(3), 'b')],
        config,
      ).findings.filter((f) => f.ruleId === 'AWI007'),
    ).toEqual([]);
  });
  it('matches exact codes and tool names without trimming or case folding', () => {
    for (const field of ['code', 'tool'] as const) {
      const ops = calls();
      if (field === 'code') ops[2]!.error = { code: 'INVALID ' };
      else ops[2]!.toolName = 'Search';
      expect(findings(ops)).toEqual([]);
    }
  });
  it('uses toolName fallback and configured ignore paths', () => {
    const ops = calls();
    ops.forEach((o) => (o.toolName = 'search'));
    expect(findings(ops)).toHaveLength(1);
    expect(
      findings(ops, { ...config, fingerprint: { ignorePaths: ['q'] } }),
    ).toEqual([]);
  });
  it('treats null as recorded arguments', () => {
    const ops = calls();
    ops[0]!.arguments = null;
    expect(findings(ops)).toHaveLength(1);
  });
  it('excludes overlapping calls', () => {
    const ops = calls();
    ops[1]!.startTime = ops[0]!.startTime;
    expect(findings(ops)).toEqual([]);
  });
  it.each(['missing', 'zero'] as const)('excludes %s timing', (kind) => {
    const ops = calls();
    if (kind === 'missing') delete ops[1]!.endTime;
    else ops[1]!.endTime = ops[1]!.startTime;
    expect(findings(ops)).toEqual([]);
  });
  it('emits one maximal run and separates interrupted runs', () => {
    expect(findings(calls(200))).toHaveLength(1);
    const ops = calls(9);
    ops[4]!.status = 'ok';
    expect(findings(ops).map((f) => f.evidence.failedCalls)).toEqual([4, 4]);
  });
  it('preserves deterministic ordering for reordered operations and fragments', () => {
    const ops = calls(9);
    ops[4]!.status = 'ok';
    const report = analyze([trace(ops)], config);
    expect(analyze([trace([...ops].reverse())], config)).toEqual(report);
    expect(
      analyze([trace(ops.slice(4)), trace(ops.slice(0, 4))], config),
    ).toEqual(report);
  });
  it('validates JSON reporting and keeps private content out of evidence', () => {
    const report = analyze([trace(calls())], config);
    expect(reportSchema.safeParse(JSON.parse(jsonReport(report))).success).toBe(
      true,
    );
    for (const output of [jsonReport(report), humanReport(report)]) {
      expect(output).not.toContain('PRIVATE_');
      expect(output).not.toContain('SECRET');
    }
    const content = jsonReport(analyze([trace(calls())], config, true));
    expect(content).not.toContain('SECRET');
    expect(content).not.toContain('PRIVATE_MESSAGE');
    expect(content).toContain('[REDACTED]');
  });
  it.each([
    { threshold: 3 },
    { threshold: 101 },
    { threshold: 4.5 },
    { minDistinctArguments: 2 },
    { minDistinctArguments: 101 },
    { minDistinctArguments: 3.5 },
    { enabled: 'true' },
    { unknown: 1 },
  ])('rejects invalid config %j', (value) => {
    expect(() => resolveConfig({ rules: { AWI007: value } })).toThrow(
      'Invalid configuration',
    );
  });
  it('honors configured minima over maximal runs', () => {
    expect(
      findings(calls(5), {
        rules: { AWI007: { enabled: true, threshold: 6 } },
      }),
    ).toEqual([]);
    expect(
      findings(calls(6), {
        rules: {
          AWI007: { enabled: true, threshold: 4, minDistinctArguments: 6 },
        },
      }),
    ).toHaveLength(1);
  });
  it('scans a large bounded synthetic trace without duplicate findings', () => {
    const result = findings(calls(10000));
    expect(result).toHaveLength(1);
    expect(result[0]!.operationIds).toHaveLength(10000);
    expect(result[0]!.evidence.distinctArgumentFingerprints).toBe(10000);
  }, 15000);
  it('retains the existing input bound', () =>
    expect(() =>
      analyze(
        [trace(Array.from({ length: LIMITS.spans + 1 }, () => calls(1)[0]!))],
        config,
      ),
    ).toThrow());
});

it('AWI007 projects timed non-tool siblings and constrains their overlap', () => {
  const ops = calls();
  const model: Operation = {
    id: 'model',
    name: 'model',
    type: 'model',
    status: 'unknown',
    startTime: new Date(1700000000600).toISOString(),
    endTime: new Date(1700000000700).toISOString(),
  };
  expect(findings([...ops, model])).toHaveLength(1);
  model.endTime = new Date(1700000001500).toISOString();
  expect(findings([...ops, model])).toEqual([]);
});
it('AWI007 preserves renderer control escaping and resource association', () => {
  const ops = calls();
  ops.forEach((o) => {
    o.toolName = 'tool\u001b[31m';
    o.error = { code: 'code\u202e', message: 'PRIVATE_MESSAGE' };
    o.usage = { inputTokens: 1 };
  });
  const report = analyze([trace(ops)], config);
  expect(
    report.findings.find((f) => f.ruleId === 'AWI006')?.evidence.recordedUsage,
  ).toEqual({ inputTokens: 4 });
  expect(humanReport(report)).not.toContain('\u001b');
  expect(humanReport(report)).not.toContain('\u202e');
  expect(jsonReport(report)).not.toContain('\u202e');
  expect(reportSchema.safeParse(JSON.parse(jsonReport(report))).success).toBe(
    true,
  );
});
it('AWI007 respects the finding cap on many disjoint runs', () => {
  const ops = calls(5005);
  ops.forEach((o, i) => {
    if (i % 5 === 4) o.status = 'ok';
  });
  const report = analyze([trace(ops)], {
    rules: {
      AWI001: { enabled: false },
      AWI002: { enabled: false },
      AWI003: { enabled: false },
      AWI004: { enabled: false },
      AWI005: { enabled: false },
      AWI006: { enabled: false },
      AWI007: { enabled: true },
    },
  });
  expect(report.findings).toHaveLength(LIMITS.findings);
  expect(report.complete).toBe(false);
  expect(report.warnings).toContain(
    'Finding limit reached; report is truncated.',
  );
});
